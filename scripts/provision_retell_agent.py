#!/usr/bin/env python3
"""Provision the Retell LLM + agent for Agora.

Usage:
    python scripts/provision_retell_agent.py

Prints out the agent_id and llm_id. Store agent_id in env as RETELL_AGENT_ID.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPT_PATH = ROOT / "packages/prompts/interview-agent.md"


def main() -> int:
    api_key = os.environ.get("RETELL_API_KEY")
    if not api_key:
        print("RETELL_API_KEY not set", file=sys.stderr)
        return 1
    from retell import Retell

    client = Retell(api_key=api_key)
    prompt_text = PROMPT_PATH.read_text()
    webhook_base = os.environ.get("RETELL_WEBHOOK_BASE_URL", "http://localhost:8000")

    tools = [
        {
            "type": "custom",
            "name": "mark_sensitive_omit",
            "description": "Called when the employee opts out of recording a sensitive item.",
            "url": f"{webhook_base}/webhooks/retell/functions/mark_sensitive_omit",
            "parameters": {
                "type": "object",
                "properties": {"label": {"type": "string"}},
                "required": ["label"],
            },
            "execution_message_description": "",
            "speak_during_execution": False,
            "speak_after_execution": False,
        },
        {
            "type": "custom",
            "name": "mark_sensitive_flag_for_review",
            "description": "Called when the employee opts in to a sensitive item — paraphrase that leadership will review.",
            "url": f"{webhook_base}/webhooks/retell/functions/mark_sensitive_flag_for_review",
            "parameters": {
                "type": "object",
                "properties": {"paraphrase": {"type": "string"}},
                "required": ["paraphrase"],
            },
            "execution_message_description": "",
            "speak_during_execution": False,
            "speak_after_execution": False,
        },
        {
            "type": "custom",
            "name": "trigger_admin_alert",
            "description": "Hard escalation for harassment, discrimination, self_harm, misconduct.",
            "url": f"{webhook_base}/webhooks/retell/functions/trigger_admin_alert",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "enum": ["harassment", "discrimination", "self_harm", "misconduct"]},
                    "summary": {"type": "string"},
                },
                "required": ["category", "summary"],
            },
            "execution_message_description": "",
            "speak_during_execution": False,
            "speak_after_execution": False,
        },
        {
            "type": "custom",
            "name": "correct_summary",
            "description": "Called during close if the employee corrects the bullet summary.",
            "url": f"{webhook_base}/webhooks/retell/functions/correct_summary",
            "parameters": {
                "type": "object",
                "properties": {"updated_summary": {"type": "string"}},
                "required": ["updated_summary"],
            },
            "execution_message_description": "",
            "speak_during_execution": False,
            "speak_after_execution": False,
        },
        {
            "type": "end_call",
            "name": "end_call",
            "description": "End the call after closing.",
        },
    ]

    llm = client.llm.create(
        general_prompt=prompt_text,
        model="gpt-4.1",
        model_temperature=0.5,
        general_tools=tools,
    )
    print(f"LLM_ID={llm.llm_id}")

    agent = client.agent.create(
        response_engine={"llm_id": llm.llm_id, "type": "retell-llm"},
        voice_id="11labs-Adrian",
        agent_name="Agora Interviewer",
        language="en-US",
        webhook_url=f"{webhook_base}/webhooks/retell",
        interruption_sensitivity=0.75,
        responsiveness=0.9,
    )
    print(f"AGENT_ID={agent.agent_id}")
    print("\nSet this in your .env:")
    print(f"RETELL_AGENT_ID={agent.agent_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
