# backend/services/pdf_report.py
import json
from io import BytesIO
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def _safe(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _format_json_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(_safe(v) for v in value)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return _safe(value)


def _build_meta_table(data: Dict[str, Any], styles) -> Table:
    rows = [["Felt", "Verdi"]]
    for key, value in data.items():
        rows.append([
            Paragraph(_safe(key), styles["table_cell"]),
            Paragraph(_safe(value), styles["table_cell"]),
        ])

    table = Table(rows, colWidths=[55 * mm, 115 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DBEAFE")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def _build_key_value_table(items: List[List[Any]]) -> Table:
    table = Table(items, colWidths=[45 * mm, 125 * mm])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EFF6FF")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def render_report_pdf(order_meta: Dict[str, Any], steps: List[Dict[str, Any]]) -> bytes:
    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Workflow-rapport {_safe(order_meta.get('OrderId'))}",
    )

    base_styles = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "title",
            parent=base_styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=8,
        ),
        "section": ParagraphStyle(
            "section",
            parent=base_styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#0F172A"),
            spaceBefore=10,
            spaceAfter=8,
        ),
        "step_title": ParagraphStyle(
            "step_title",
            parent=base_styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=14,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=13,
            alignment=TA_LEFT,
            textColor=colors.HexColor("#1F2937"),
        ),
        "muted": ParagraphStyle(
            "muted",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#64748B"),
        ),
        "table_cell": ParagraphStyle(
            "table_cell",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#1F2937"),
        ),
    }

    story = []

    story.append(Paragraph("Workflow-rapport", styles["title"]))
    story.append(Paragraph("PDF-eksport av ordre og stegdata", styles["muted"]))
    story.append(Spacer(1, 6))

    summary_items = [
        ["Ordre", Paragraph(_safe(order_meta.get("OrderId")), styles["body"])],
        ["Status", Paragraph(_safe(order_meta.get("Status")), styles["body"])],
        ["AMID", Paragraph(_safe(order_meta.get("ExternalAmid")), styles["body"])],
    ]
    story.append(_build_key_value_table(summary_items))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Objektmetadata", styles["section"]))
    story.append(_build_meta_table(order_meta, styles))
    story.append(Spacer(1, 12))

    total_steps = len(steps)
    steps_with_commentary = sum(1 for s in steps if (_safe(s.get("commentary")).strip()))
    completed_steps = sum(1 for s in steps if _safe(s.get("Status")).lower() == "completed")

    story.append(Paragraph("Oppsummering", styles["section"]))
    summary_table = _build_key_value_table([
        ["Antall steg", Paragraph(str(total_steps), styles["body"])],
        ["Fullførte steg", Paragraph(str(completed_steps), styles["body"])],
        ["Steg med kommentarer", Paragraph(str(steps_with_commentary), styles["body"])],
    ])
    story.append(summary_table)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Stegdetaljer", styles["section"]))

    for step in steps:
        step_title = f"{_safe(step.get('Sequence'))}. {_safe(step.get('Name'))}"
        story.append(Paragraph(step_title, styles["step_title"]))
        story.append(Paragraph(f"OrderStepId: {_safe(step.get('OrderStepId'))}", styles["muted"]))
        story.append(Spacer(1, 4))

        step_info = _build_key_value_table([
            ["Status", Paragraph(_safe(step.get("Status")), styles["body"])],
            ["Tildelt", Paragraph(_safe(step.get("AssignedToName")), styles["body"])],
            ["Sist oppdatert", Paragraph(_safe(step.get("form_updated_at_utc") or step.get("UpdatedAtUtc")), styles["body"])],
        ])
        story.append(step_info)
        story.append(Spacer(1, 6))

        commentary = _safe(step.get("commentary")).strip()
        story.append(Paragraph("Kommentar", styles["body"]))
        story.append(
            Paragraph(commentary if commentary else "Ingen kommentar registrert.", styles["body"])
        )
        story.append(Spacer(1, 6))

        extra_fields = step.get("form_data", {}) or {}
        filtered_items = [
            [Paragraph(_safe(k), styles["table_cell"]), Paragraph(_format_json_value(v), styles["table_cell"])]
            for k, v in extra_fields.items()
            if k not in {"kommentarer", "commentary"}
        ]

        story.append(Paragraph("Øvrige felt", styles["body"]))
        if filtered_items:
            extra_table = Table(filtered_items, colWidths=[45 * mm, 125 * mm])
            extra_table.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F8FAFC")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(extra_table)
        else:
            story.append(Paragraph("Ingen øvrige felt registrert.", styles["muted"]))

        story.append(Spacer(1, 12))

    doc.build(story)
    return buffer.getvalue()