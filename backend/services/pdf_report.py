# backend/services/pdf_report.py
import json
from html import escape
from typing import Any, Dict, List, Optional

from weasyprint import HTML


def _safe(value: Any) -> str:
    if value is None:
        return ""
    return escape(str(value))


def _format_json_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(_safe(v) for v in value)
    if isinstance(value, dict):
        return _safe(json.dumps(value, ensure_ascii=False))
    return _safe(value)


def build_order_report_html(order_meta: Dict[str, Any], steps: List[Dict[str, Any]]) -> str:
    total_steps = len(steps)
    steps_with_commentary = sum(1 for s in steps if (s.get("commentary") or "").strip())
    completed_steps = sum(1 for s in steps if str(s.get("Status") or "").lower() == "completed")

    meta_rows = "".join(
        f"""
        <tr>
            <th>{_safe(k)}</th>
            <td>{_safe(v)}</td>
        </tr>
        """
        for k, v in order_meta.items()
    )

    step_sections = []
    for step in steps:
        extra_fields = step.get("form_fields", {})
        extra_rows = "".join(
            f"""
            <tr>
                <th>{_safe(key)}</th>
                <td>{_format_json_value(val)}</td>
            </tr>
            """
            for key, val in extra_fields.items()
            if key not in {"kommentarer", "commentary"}
        )

        commentary = (step.get("commentary") or "").strip()

        step_sections.append(
            f"""
            <section class="step">
                <div class="step-header">
                    <div>
                        <div class="step-title">{_safe(step.get("Sequence"))}. {_safe(step.get("Name"))}</div>
                        <div class="muted">OrderStepId: {_safe(step.get("OrderStepId"))}</div>
                    </div>
                    <div class="badge">{_safe(step.get("Status"))}</div>
                </div>

                <table class="meta-table">
                    <tr>
                        <th>Tildelt</th>
                        <td>{_safe(step.get("AssignedToName"))}</td>
                    </tr>
                    <tr>
                        <th>Sist oppdatert</th>
                        <td>{_safe(step.get("UpdatedAtUtc"))}</td>
                    </tr>
                </table>

                <h3>Kommentar</h3>
                {
                    f'<div class="commentary">{_safe(commentary)}</div>'
                    if commentary
                    else '<p class="muted">Ingen kommentar registrert.</p>'
                }

                <h3>Øvrige felt</h3>
                {
                    f'<table class="meta-table">{extra_rows}</table>'
                    if extra_rows
                    else '<p class="muted">Ingen øvrige felt registrert.</p>'
                }
            </section>
            """
        )

    return f"""
    <!doctype html>
    <html lang="no">
    <head>
        <meta charset="utf-8">
        <style>
            @page {{
                size: A4;
                margin: 18mm 14mm;
            }}

            body {{
                font-family: Arial, Helvetica, sans-serif;
                font-size: 12px;
                color: #1f2937;
                line-height: 1.45;
            }}

            h1, h2, h3 {{
                color: #0f172a;
                margin: 0 0 8px 0;
            }}

            h1 {{
                font-size: 24px;
                margin-bottom: 12px;
            }}

            h2 {{
                font-size: 16px;
                margin: 20px 0 10px 0;
                border-bottom: 2px solid #dbeafe;
                padding-bottom: 4px;
            }}

            .header {{
                display: flex;
                justify-content: space-between;
                border-bottom: 3px solid #2563eb;
                padding-bottom: 12px;
                margin-bottom: 18px;
            }}

            .summary {{
                display: flex;
                gap: 10px;
                margin: 16px 0 20px 0;
            }}

            .summary-card {{
                flex: 1;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                padding: 10px;
                background: #f8fafc;
            }}

            .summary-label {{
                color: #64748b;
                font-size: 11px;
                text-transform: uppercase;
            }}

            .summary-value {{
                font-size: 18px;
                font-weight: bold;
                margin-top: 4px;
            }}

            .meta-table {{
                width: 100%;
                border-collapse: collapse;
                margin-top: 8px;
            }}

            .meta-table th,
            .meta-table td {{
                border: 1px solid #e2e8f0;
                padding: 8px;
                text-align: left;
                vertical-align: top;
            }}

            .meta-table th {{
                width: 30%;
                background: #eff6ff;
            }}

            .step {{
                border: 1px solid #cbd5e1;
                border-radius: 10px;
                padding: 14px;
                margin-bottom: 16px;
                page-break-inside: avoid;
            }}

            .step-header {{
                display: flex;
                justify-content: space-between;
                margin-bottom: 10px;
            }}

            .step-title {{
                font-size: 15px;
                font-weight: bold;
            }}

            .badge {{
                background: #dbeafe;
                color: #1d4ed8;
                border-radius: 999px;
                padding: 4px 8px;
                font-size: 11px;
                font-weight: bold;
                height: fit-content;
            }}

            .commentary {{
                background: #f8fafc;
                border-left: 4px solid #2563eb;
                padding: 10px 12px;
                border-radius: 6px;
                white-space: pre-wrap;
            }}

            .muted {{
                color: #64748b;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <div>
                <h1>Workflow-rapport</h1>
                <div class="muted">PDF-eksport av ordre og stegdata</div>
            </div>
            <div>
                <div><strong>Ordre:</strong> {_safe(order_meta.get("OrderId"))}</div>
            </div>
        </div>

        <h2>Objektmetadata</h2>
        <table class="meta-table">
            {meta_rows}
        </table>

        <div class="summary">
            <div class="summary-card">
                <div class="summary-label">Antall steg</div>
                <div class="summary-value">{total_steps}</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">Fullførte steg</div>
                <div class="summary-value">{completed_steps}</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">Steg med kommentarer</div>
                <div class="summary-value">{steps_with_commentary}</div>
            </div>
        </div>

        <h2>Stegdetaljer</h2>
        {''.join(step_sections)}
    </body>
    </html>
    """


def render_report_pdf(order_meta: Dict[str, Any], steps: List[Dict[str, Any]]) -> bytes:
    html = build_order_report_html(order_meta, steps)
    return HTML(string=html).write_pdf()