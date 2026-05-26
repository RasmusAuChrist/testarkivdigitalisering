import math
import random
from statistics import mean
from typing import List, Optional

import simpy
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


DEFAULT_STEPS = [
    {"step_id": 1, "name": "Analyse", "workers": 1, "mean_hours": 2.0, "variability": 0.35},
    {"step_id": 2, "name": "Prioriteringsrad", "workers": 1, "mean_hours": 1.5, "variability": 0.30},
    {"step_id": 3, "name": "Arkivkartlegging", "workers": 2, "mean_hours": 4.0, "variability": 0.45},
    {"step_id": 4, "name": "Fysisk klargjoring", "workers": 2, "mean_hours": 5.0, "variability": 0.45},
    {"step_id": 5, "name": "Klar til sending", "workers": 1, "mean_hours": 1.0, "variability": 0.25},
    {"step_id": 6, "name": "Lager NHA", "workers": 1, "mean_hours": 2.0, "variability": 0.35},
    {"step_id": 7, "name": "Skanning pagar", "workers": 2, "mean_hours": 6.0, "variability": 0.50},
    {"step_id": 8, "name": "Etterarbeid skanning", "workers": 2, "mean_hours": 3.5, "variability": 0.40},
    {"step_id": 9, "name": "Skape uttrekk", "workers": 1, "mean_hours": 4.0, "variability": 0.45},
    {"step_id": 10, "name": "Kvalitetskontroll", "workers": 2, "mean_hours": 3.0, "variability": 0.35},
    {"step_id": 11, "name": "Opplasting og innlemming", "workers": 1, "mean_hours": 2.5, "variability": 0.35},
    {"step_id": 12, "name": "Metadata etterarbeid", "workers": 1, "mean_hours": 2.0, "variability": 0.30},
    {"step_id": 13, "name": "Opprydning for destruksjon", "workers": 1, "mean_hours": 1.5, "variability": 0.30},
    {"step_id": 14, "name": "Opprydning for videresending", "workers": 1, "mean_hours": 1.5, "variability": 0.30},
]


class SimulationStep(BaseModel):
    step_id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=120)
    workers: int = Field(default=1, ge=1, le=100)
    mean_hours: float = Field(default=2.0, gt=0, le=1000)
    variability: float = Field(default=0.35, ge=0, le=3)
    initial_backlog: int = Field(default=0, ge=0, le=20000)


class SimulationRequest(BaseModel):
    days: int = Field(default=30, ge=1, le=365)
    hours_per_day: float = Field(default=7.5, gt=0, le=24)
    arrivals_per_day: float = Field(default=4.0, ge=0, le=1000)
    random_seed: Optional[int] = Field(default=42)
    steps: List[SimulationStep] = Field(default_factory=lambda: [SimulationStep(**s) for s in DEFAULT_STEPS])


class StepRuntime:
    def __init__(self):
        self.entered = 0
        self.completed = 0
        self.busy_time = 0.0
        self.wait_times: list[float] = []
        self.service_times: list[float] = []


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil((pct / 100) * len(ordered)) - 1))
    return ordered[index]


def _duration(rng: random.Random, mean_hours: float, variability: float) -> float:
    if variability <= 0:
        return mean_hours

    sigma = math.sqrt(math.log((variability * variability) + 1))
    mu = math.log(mean_hours) - (sigma * sigma / 2)
    return max(0.01, rng.lognormvariate(mu, sigma))


@router.get("/wf/simulation/defaults")
def get_simulation_defaults():
    return {
        "days": 30,
        "hours_per_day": 7.5,
        "arrivals_per_day": 4.0,
        "random_seed": 42,
        "steps": DEFAULT_STEPS,
    }


@router.post("/wf/simulation/run")
def run_workflow_simulation(payload: SimulationRequest):
    if not payload.steps:
        raise HTTPException(status_code=400, detail="Minst ett steg ma defineres.")

    rng = random.Random(payload.random_seed)
    env = simpy.Environment()
    horizon = payload.days * payload.hours_per_day
    steps = payload.steps
    resources = [simpy.Resource(env, capacity=step.workers) for step in steps]
    runtime = [StepRuntime() for _ in steps]
    cycle_times: list[float] = []
    created_count = 0

    def process_item(start_index: int, created_at: float):
        for step_index in range(start_index, len(steps)):
            stats = runtime[step_index]
            step = steps[step_index]
            stats.entered += 1
            queue_entered = env.now

            with resources[step_index].request() as request:
                yield request
                wait = env.now - queue_entered
                service = _duration(rng, step.mean_hours, step.variability)
                stats.wait_times.append(wait)
                stats.busy_time += min(service, max(0.0, horizon - env.now))

                yield env.timeout(service)

                stats.service_times.append(service)
                stats.completed += 1

        cycle_times.append(env.now - created_at)

    for step_index, step in enumerate(steps):
        for _ in range(step.initial_backlog):
            env.process(process_item(step_index, 0.0))
            created_count += 1

    def arrival_generator():
        nonlocal created_count
        if payload.arrivals_per_day <= 0:
            return

        arrival_rate_per_hour = payload.arrivals_per_day / payload.hours_per_day
        while env.now < horizon:
            yield env.timeout(rng.expovariate(arrival_rate_per_hour))
            if env.now > horizon:
                break
            env.process(process_item(0, env.now))
            created_count += 1

    env.process(arrival_generator())
    env.run(until=horizon)

    step_results = []
    for step, stats in zip(steps, runtime):
        utilization = stats.busy_time / (horizon * step.workers) if horizon > 0 and step.workers else 0
        avg_wait = mean(stats.wait_times) if stats.wait_times else 0.0
        avg_service = mean(stats.service_times) if stats.service_times else 0.0
        step_results.append({
            "step_id": step.step_id,
            "name": step.name,
            "workers": step.workers,
            "mean_hours": step.mean_hours,
            "initial_backlog": step.initial_backlog,
            "entered": stats.entered,
            "completed": stats.completed,
            "wip": max(0, stats.entered - stats.completed),
            "avg_wait_hours": round(avg_wait, 2),
            "p95_wait_hours": round(_percentile(stats.wait_times, 95), 2),
            "avg_service_hours": round(avg_service, 2),
            "utilization": round(min(utilization, 1.5), 4),
        })

    bottlenecks = sorted(
        step_results,
        key=lambda item: (item["utilization"], item["p95_wait_hours"], item["wip"]),
        reverse=True,
    )[:3]

    completed_pipeline = len(cycle_times)
    return {
        "horizon_hours": round(horizon, 2),
        "created_items": created_count,
        "completed_items": completed_pipeline,
        "throughput_per_day": round(completed_pipeline / payload.days, 2),
        "avg_cycle_time_hours": round(mean(cycle_times), 2) if cycle_times else 0.0,
        "p95_cycle_time_hours": round(_percentile(cycle_times, 95), 2),
        "bottlenecks": bottlenecks,
        "steps": step_results,
    }
