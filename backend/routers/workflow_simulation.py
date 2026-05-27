import math
import random
from statistics import mean
from typing import List, Optional

import simpy
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


DEFAULT_STEPS = [
    {"step_id": 1, "name": "Analyse", "kind": "process", "capacity_hm_per_week": 36.0, "keep_pct": 85.0, "variability": 0.20},
    {"step_id": 2, "name": "Prioriteringsrad", "kind": "process", "capacity_hm_per_week": 32.0, "keep_pct": 90.0, "variability": 0.20},
    {"step_id": 3, "name": "Arkivkartlegging", "kind": "process", "capacity_hm_per_week": 26.0, "keep_pct": 95.0, "variability": 0.25},
    {"step_id": 4, "name": "Fysisk klargjoring", "kind": "process", "capacity_hm_per_week": 24.0, "keep_pct": 100.0, "variability": 0.25},
    {"step_id": 5, "name": "Klar til sending", "kind": "storage", "capacity_hm_per_week": 0.0, "keep_pct": 100.0, "variability": 0.0},
    {"step_id": 6, "name": "Lager NHA", "kind": "storage", "capacity_hm_per_week": 0.0, "keep_pct": 100.0, "variability": 0.0},
    {"step_id": 7, "name": "Skanning pagar", "kind": "process", "capacity_hm_per_week": 20.0, "keep_pct": 100.0, "variability": 0.15},
    {"step_id": 8, "name": "Etterarbeid skanning", "kind": "process", "capacity_hm_per_week": 24.0, "keep_pct": 100.0, "variability": 0.20},
    {"step_id": 9, "name": "Skape uttrekk", "kind": "process", "capacity_hm_per_week": 22.0, "keep_pct": 100.0, "variability": 0.20},
    {"step_id": 10, "name": "Kvalitetskontroll", "kind": "process", "capacity_hm_per_week": 20.0, "keep_pct": 100.0, "variability": 0.20},
    {"step_id": 11, "name": "Opplasting og innlemming", "kind": "process", "capacity_hm_per_week": 25.0, "keep_pct": 100.0, "variability": 0.15},
    {"step_id": 12, "name": "Metadata etterarbeid", "kind": "process", "capacity_hm_per_week": 25.0, "keep_pct": 100.0, "variability": 0.15},
    {"step_id": 13, "name": "Opprydning for destruksjon", "kind": "cleanup", "capacity_hm_per_week": 18.0, "keep_pct": 100.0, "variability": 0.20},
    {"step_id": 14, "name": "Opprydning for videresending", "kind": "cleanup", "capacity_hm_per_week": 18.0, "keep_pct": 100.0, "variability": 0.20},
]

PRE_STORAGE_STEPS = [1, 2, 3, 4]
POST_STORAGE_STEPS = [7, 8, 9, 10, 11, 12]
CLEANUP_STEPS = [13, 14]


class SimulationStep(BaseModel):
    step_id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(default="process", max_length=20)
    capacity_hm_per_week: float = Field(default=20.0, ge=0, le=10000)
    keep_pct: float = Field(default=100.0, ge=0, le=100)
    variability: float = Field(default=0.20, ge=0, le=3)
    initial_backlog_hm: float = Field(default=0.0, ge=0, le=10000)


class SimulationRequest(BaseModel):
    weeks: int = Field(default=12, ge=1, le=104)
    hours_per_week: float = Field(default=37.5, gt=0, le=168)
    target_hm_per_week: float = Field(default=20.0, ge=0, le=10000)
    batch_hm: float = Field(default=5.0, gt=0, le=200)
    step5_capacity_hm: float = Field(default=200.0, gt=0, le=10000)
    step6_capacity_hm: float = Field(default=50.0, gt=0, le=10000)
    cleanup_destruction_share: float = Field(default=0.50, ge=0, le=1)
    random_seed: Optional[int] = Field(default=42)
    steps: List[SimulationStep] = Field(default_factory=lambda: [SimulationStep(**s) for s in DEFAULT_STEPS])


class StepRuntime:
    def __init__(self, kind: str):
        self.kind = kind
        self.entered_hm = 0.0
        self.processed_hm = 0.0
        self.output_hm = 0.0
        self.discarded_hm = 0.0
        self.busy_time = 0.0
        self.wait_times: list[float] = []
        self.service_times: list[float] = []
        self.blocked_hours = 0.0
        self.max_wip_hm = 0.0
        self.current_level_hm = 0.0
        self.level_area = 0.0
        self.last_level_update = 0.0
        self.active_since: Optional[float] = None


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil((pct / 100) * len(ordered)) - 1))
    return ordered[index]


def _service_hours(
    rng: random.Random,
    hyllemeter: float,
    capacity_hm_per_week: float,
    hours_per_week: float,
    variability: float,
) -> float:
    if capacity_hm_per_week <= 0:
        return math.inf

    base = hyllemeter / (capacity_hm_per_week / hours_per_week)
    if variability <= 0:
        return max(0.01, base)

    sigma = math.sqrt(math.log((variability * variability) + 1))
    mu = math.log(base) - (sigma * sigma / 2)
    return max(0.01, rng.lognormvariate(mu, sigma))


def _update_storage_runtime(runtime: StepRuntime, env: simpy.Environment, level: float):
    runtime.level_area += runtime.current_level_hm * (env.now - runtime.last_level_update)
    runtime.last_level_update = env.now
    runtime.current_level_hm = level
    runtime.max_wip_hm = max(runtime.max_wip_hm, level)


def _required_input_for_target(target_hm_per_week: float, steps: dict[int, SimulationStep]) -> float:
    keep_factor = 1.0
    for step_id in [1, 2, 3]:
        keep_factor *= max(steps[step_id].keep_pct / 100, 0)
    if keep_factor <= 0:
        return 0.0
    return target_hm_per_week / keep_factor


def _required_by_step(payload: SimulationRequest, steps: dict[int, SimulationStep]) -> dict[int, float]:
    target = payload.target_hm_per_week
    required: dict[int, float] = {}

    for step_id in PRE_STORAGE_STEPS:
        keep_factor = 1.0
        for keep_step_id in [1, 2, 3]:
            if keep_step_id >= step_id:
                keep_factor *= max(steps[keep_step_id].keep_pct / 100, 0)
        required[step_id] = target / keep_factor if keep_factor > 0 else 0.0

    for step_id in [5, 6, *POST_STORAGE_STEPS]:
        required[step_id] = target

    required[13] = target * payload.cleanup_destruction_share
    required[14] = target * (1 - payload.cleanup_destruction_share)
    return required


def _summarize_step(
    step: SimulationStep,
    runtime: StepRuntime,
    elapsed_weeks: float,
    elapsed_hours: float,
    required_hm_per_week: float,
    storage_capacity_hm: Optional[float] = None,
) -> dict:
    elapsed_weeks = max(elapsed_weeks, 0.0001)
    elapsed_hours = max(elapsed_hours, 0.0001)

    if storage_capacity_hm:
        level_area = runtime.level_area + runtime.current_level_hm * max(0.0, elapsed_hours - runtime.last_level_update)
        avg_level = level_area / elapsed_hours
        utilization = avg_level / storage_capacity_hm if storage_capacity_hm > 0 else 0.0
        wip = runtime.current_level_hm
        max_wip = runtime.max_wip_hm
        capacity_hm_per_week = None
        capacity_gap = storage_capacity_hm - max_wip
    else:
        active_time = max(0.0, elapsed_hours - runtime.active_since) if runtime.active_since is not None else 0.0
        utilization = (runtime.busy_time + active_time) / elapsed_hours
        wip = max(0.0, runtime.entered_hm - runtime.processed_hm)
        max_wip = max(runtime.max_wip_hm, wip)
        capacity_hm_per_week = step.capacity_hm_per_week
        capacity_gap = step.capacity_hm_per_week - required_hm_per_week

    return {
        "step_id": step.step_id,
        "name": step.name,
        "kind": step.kind,
        "capacity_hm_per_week": capacity_hm_per_week,
        "storage_capacity_hm": storage_capacity_hm,
        "required_hm_per_week": round(required_hm_per_week, 2),
        "entered_hm_per_week": round(runtime.entered_hm / elapsed_weeks, 2),
        "output_hm_per_week": round(runtime.output_hm / elapsed_weeks, 2),
        "discarded_hm_per_week": round(runtime.discarded_hm / elapsed_weeks, 2),
        "capacity_gap_hm": round(capacity_gap, 2),
        "keep_pct": step.keep_pct,
        "initial_backlog_hm": step.initial_backlog_hm,
        "wip_hm": round(wip, 2),
        "max_wip_hm": round(max_wip, 2),
        "avg_wait_hours": round(mean(runtime.wait_times), 2) if runtime.wait_times else 0.0,
        "p95_wait_hours": round(_percentile(runtime.wait_times, 95), 2),
        "blocked_hours": round(runtime.blocked_hours, 2),
        "utilization": round(min(utilization, 2.0), 4),
    }


@router.get("/wf/simulation/defaults")
def get_simulation_defaults():
    return {
        "weeks": 12,
        "hours_per_week": 37.5,
        "target_hm_per_week": 20.0,
        "batch_hm": 5.0,
        "step5_capacity_hm": 200.0,
        "step6_capacity_hm": 50.0,
        "cleanup_destruction_share": 0.50,
        "random_seed": 42,
        "steps": DEFAULT_STEPS,
    }


@router.post("/wf/simulation/run")
def run_workflow_simulation(payload: SimulationRequest):
    if not payload.steps:
        raise HTTPException(status_code=400, detail="Minst ett steg ma defineres.")

    steps = {step.step_id: step for step in payload.steps}
    missing = [step_id for step_id in [*PRE_STORAGE_STEPS, 5, 6, *POST_STORAGE_STEPS, *CLEANUP_STEPS] if step_id not in steps]
    if missing:
        raise HTTPException(status_code=400, detail=f"Mangler steg: {', '.join(map(str, missing))}.")

    rng = random.Random(payload.random_seed)
    env = simpy.Environment()
    horizon = payload.weeks * payload.hours_per_week
    runtime = {step_id: StepRuntime(steps[step_id].kind) for step_id in steps}
    resources = {
        step_id: simpy.Resource(env, capacity=1)
        for step_id in steps
        if steps[step_id].kind != "storage"
    }
    step5_storage = simpy.Container(env, capacity=payload.step5_capacity_hm, init=0)
    step6_storage = simpy.Container(env, capacity=payload.step6_capacity_hm, init=0)
    cycle_times: list[float] = []
    gross_created_hm = 0.0
    scanned_hm = 0.0
    released_hm = 0.0
    snapshots: list[dict] = []
    required = _required_by_step(payload, steps)

    def build_snapshot(week: int, elapsed_hours: float):
        elapsed_weeks = max(elapsed_hours / payload.hours_per_week, 0.0001)
        step_results = []
        for step_id in sorted(steps):
            storage_capacity = None
            if step_id == 5:
                storage_capacity = payload.step5_capacity_hm
            elif step_id == 6:
                storage_capacity = payload.step6_capacity_hm

            step_results.append(
                _summarize_step(
                    steps[step_id],
                    runtime[step_id],
                    elapsed_weeks,
                    elapsed_hours,
                    required.get(step_id, payload.target_hm_per_week),
                    storage_capacity,
                )
            )

        bottlenecks = sorted(
            step_results,
            key=lambda item: (
                item["capacity_gap_hm"] < 0,
                item["utilization"],
                item["blocked_hours"],
                item["p95_wait_hours"],
                item["max_wip_hm"],
            ),
            reverse=True,
        )[:3]

        gross_needed = _required_input_for_target(payload.target_hm_per_week, steps)
        released_per_week = released_hm / elapsed_weeks
        scanned_per_week = scanned_hm / elapsed_weeks
        target_gap = released_per_week - payload.target_hm_per_week

        return {
            "week": week,
            "elapsed_hours": round(elapsed_hours, 2),
            "horizon_hours": round(horizon, 2),
            "weeks": payload.weeks,
            "target_hm_per_week": round(payload.target_hm_per_week, 2),
            "gross_needed_hm_per_week": round(gross_needed, 2),
            "gross_created_hm": round(gross_created_hm, 2),
            "scanned_hm": round(scanned_hm, 2),
            "released_hm": round(released_hm, 2),
            "scanned_hm_per_week": round(scanned_per_week, 2),
            "released_hm_per_week": round(released_per_week, 2),
            "target_gap_hm_per_week": round(target_gap, 2),
            "target_met": released_per_week >= payload.target_hm_per_week * 0.98,
            "avg_cycle_time_hours": round(mean(cycle_times), 2) if cycle_times else 0.0,
            "p95_cycle_time_hours": round(_percentile(cycle_times, 95), 2),
            "bottlenecks": bottlenecks,
            "steps": step_results,
        }

    def service_step(step_id: int, hyllemeter: float):
        step = steps[step_id]
        stats = runtime[step_id]
        stats.entered_hm += hyllemeter
        stats.max_wip_hm = max(stats.max_wip_hm, stats.entered_hm - stats.processed_hm)

        queue_entered = env.now
        with resources[step_id].request() as request:
            yield request
            wait = env.now - queue_entered
            service = _service_hours(
                rng,
                hyllemeter,
                step.capacity_hm_per_week,
                payload.hours_per_week,
                step.variability,
            )
            stats.wait_times.append(wait)

            if math.isinf(service):
                stats.blocked_hours += max(0.0, horizon - env.now)
                yield env.timeout(max(0.0, horizon - env.now))
                return 0.0

            stats.active_since = env.now
            yield env.timeout(service)
            stats.busy_time += max(0.0, env.now - stats.active_since)
            stats.active_since = None
            stats.service_times.append(service)
            stats.processed_hm += hyllemeter

        kept = hyllemeter * (step.keep_pct / 100)
        stats.output_hm += kept
        stats.discarded_hm += max(0.0, hyllemeter - kept)
        return kept

    def move_to_scanning_storage(hyllemeter: float):
        step5_stats = runtime[5]

        wait_start = env.now
        yield step5_storage.put(hyllemeter)
        blocked = env.now - wait_start
        step5_stats.blocked_hours += blocked
        step5_stats.wait_times.append(blocked)
        step5_stats.entered_hm += hyllemeter
        _update_storage_runtime(step5_stats, env, step5_storage.level)

        yield env.process(enter_scanning_storage(hyllemeter))
        yield step5_storage.get(hyllemeter)
        step5_stats.output_hm += hyllemeter
        _update_storage_runtime(step5_stats, env, step5_storage.level)

    def enter_scanning_storage(hyllemeter: float):
        step6_stats = runtime[6]
        wait_start = env.now
        yield step6_storage.put(hyllemeter)
        blocked = env.now - wait_start
        step6_stats.blocked_hours += blocked
        step6_stats.wait_times.append(blocked)
        step6_stats.entered_hm += hyllemeter
        _update_storage_runtime(step6_stats, env, step6_storage.level)

    def release_scanning_storage(hyllemeter: float):
        nonlocal released_hm
        yield step6_storage.get(hyllemeter)
        runtime[6].output_hm += hyllemeter
        _update_storage_runtime(runtime[6], env, step6_storage.level)
        released_hm += hyllemeter

    def process_material(hyllemeter: float, created_at: float, start_step_id: int = 1):
        nonlocal scanned_hm

        current_hm = hyllemeter

        if start_step_id <= 4:
            for step_id in [step for step in PRE_STORAGE_STEPS if step >= start_step_id]:
                current_hm = yield env.process(service_step(step_id, current_hm))
                if current_hm <= 0:
                    return
            yield env.process(move_to_scanning_storage(current_hm))
            next_post_step = 7
        elif start_step_id == 5:
            yield env.process(move_to_scanning_storage(current_hm))
            next_post_step = 7
        elif start_step_id == 6:
            yield env.process(enter_scanning_storage(current_hm))
            next_post_step = 7
        elif start_step_id in POST_STORAGE_STEPS:
            yield env.process(enter_scanning_storage(current_hm))
            next_post_step = start_step_id
        elif start_step_id in CLEANUP_STEPS:
            yield env.process(enter_scanning_storage(current_hm))
            current_hm = yield env.process(service_step(start_step_id, current_hm))
            yield env.process(release_scanning_storage(current_hm))
            cycle_times.append(env.now - created_at)
            return
        else:
            return

        for step_id in [step for step in POST_STORAGE_STEPS if step >= next_post_step]:
            current_hm = yield env.process(service_step(step_id, current_hm))
            if step_id == 7:
                scanned_hm += current_hm

        cleanup_step = 13 if rng.random() < payload.cleanup_destruction_share else 14
        current_hm = yield env.process(service_step(cleanup_step, current_hm))
        yield env.process(release_scanning_storage(current_hm))
        cycle_times.append(env.now - created_at)

    def add_initial_backlogs():
        for step_id, step in steps.items():
            backlog = step.initial_backlog_hm
            if backlog <= 0:
                continue
            env.process(process_material(backlog, 0.0, step_id))

    def arrival_generator():
        nonlocal gross_created_hm
        gross_input_hm_per_week = _required_input_for_target(payload.target_hm_per_week, steps)
        if gross_input_hm_per_week <= 0:
            return

        gross_per_hour = gross_input_hm_per_week / payload.hours_per_week
        interval = payload.batch_hm / gross_per_hour
        while env.now < horizon:
            gross_created_hm += payload.batch_hm
            env.process(process_material(payload.batch_hm, env.now))
            yield env.timeout(interval)

    add_initial_backlogs()
    env.process(arrival_generator())

    for week in range(1, payload.weeks + 1):
        mark = week * payload.hours_per_week
        env.run(until=mark)
        snapshots.append(build_snapshot(week, mark))

    final_snapshot = snapshots[-1] if snapshots else build_snapshot(payload.weeks, horizon)
    return {
        **final_snapshot,
        "snapshots": snapshots,
    }
