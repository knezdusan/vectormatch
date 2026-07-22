#!/usr/bin/env python3
"""VectorMatch reusable FAQ component.

Separates FAQ data from presentation so every WordPress blog post renders the
FAQ section with the same markup, CSS classes, and structured-data pattern.

Usage from Python:
    from docs.wordpress.lib.faq_component import render_faq
    html = render_faq([
        {"question": "...", "answer": "..."},
    ])

Usage from the command line:
    python3 docs/wordpress/lib/faq_component.py path/to/faq.json
"""

import json
import os
import re
from pathlib import Path

COMPONENT_DIR = Path(__file__).resolve().parent
COMPONENT_TEMPLATE = COMPONENT_DIR / "faq_component.html"


def _strip_html_tags(text: str) -> str:
    """Return plain text suitable for JSON-LD, without HTML tags."""
    return re.sub(r"<[^>]+>", "", text)


def _build_item_html(question: str, answer: str, index: int) -> str:
    """Render a single FAQ item as an accordion (details/summary)."""
    item_id = f"vm-faq-item-{index + 1}"
    return (
        f'<details class="vm-faq-item" id="{item_id}">\n'
        f'  <summary class="vm-faq-question" style="padding-left: 1rem; cursor: pointer;">{question}</summary>\n'
        f'  <div class="vm-faq-answer">{answer}</div>\n'
        f"</details>\n"
    )


def _build_schema_html(questions: list[dict[str, str]]) -> str:
    """Generate an FAQPage JSON-LD script block from the FAQ data."""
    main_entity = [
        {
            "@type": "Question",
            "name": _strip_html_tags(item["question"]),
            "acceptedAnswer": {
                "@type": "Answer",
                "text": _strip_html_tags(item["answer"]),
            },
        }
        for item in questions
    ]
    schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": main_entity,
    }
    return (
        '<script type="application/ld+json">\n'
        f"{json.dumps(schema, indent=2, ensure_ascii=False)}\n"
        "</script>\n"
    )


def render_faq(faq_items: list[dict[str, str]]) -> str:
    """Render the complete FAQ component for a given list of Q&A dicts."""
    if not faq_items:
        return ""

    template = COMPONENT_TEMPLATE.read_text(encoding="utf-8")
    items_html = "".join(
        _build_item_html(item["question"], item["answer"], i)
        for i, item in enumerate(faq_items)
    )
    schema_html = _build_schema_html(faq_items)

    return template.replace("{{ITEMS}}", items_html).replace("{{SCHEMA}}", schema_html)


def main() -> None:
    import sys

    if len(sys.argv) != 2:
        print("Usage: python3 faq_component.py <faq.json>", file=sys.stderr)
        raise SystemExit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)

    print(render_faq(data))


if __name__ == "__main__":
    main()
