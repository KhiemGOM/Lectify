"""
Centralized model selection for OpenAI calls.

For robust testing and consistent behavior, keep the model name in one place.
Override via env var:
- DLW_OPENAI_MODEL_NAME
"""

from __future__ import annotations

import os


# Default to the strongest general-purpose GPT model available in the OpenAI API.
DEFAULT_MODEL_NAME: str = os.getenv("DLW_OPENAI_MODEL_NAME", "gpt-5.2")
