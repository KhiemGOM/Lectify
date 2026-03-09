import os
import re
from collections import defaultdict
from typing import Any, Dict, Tuple

from dotenv import load_dotenv
from openai import OpenAI

from .model_config import DEFAULT_MODEL_NAME
from .prompts import build_chunk_request, build_quiz_prompt, build_grade_prompt, build_summarize_prompt


def get_openai_client(api_key: str | None = None) -> OpenAI:
    load_dotenv()
    key = api_key or os.getenv("OPENAI_API_KEY")
    if not key:
        raise ValueError("OPENAI_API_KEY is not set.")
    return OpenAI(api_key=key)


def call_openai_model(
        client: OpenAI,
        prompt: str,
        model_name: str,
        *,
        temperature: float = 0.7,
        system_prompt: str = "You are a helpful assistant.",
) -> str:
    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


def parse_sections(text: str, section_name: str, repeatable: bool = False):
    prefix = "!" if repeatable else ""
    pattern = re.compile(
        rf"<<{prefix}{section_name}>>\s*(.*?)\s*<</{prefix}{section_name}>>",
        re.DOTALL,
    )
    matches = pattern.findall(text)
    if repeatable:
        return [m.strip() for m in matches]
    return matches[0].strip() if matches else None


def parse_metadata(section_text: str) -> Tuple[Dict[str, Any], str]:
    """
    Parses <<TOKEN:VALUE>> or <<!TOKEN:VALUE>> metadata from a section, and returns
    both the metadata dict and the leftover text.

    Returns:
        metadata: dict of keys → single value or list if repeated (marked with !)
        remaining_text: string with all <<TOKEN:VALUE>> removed
    """
    # Match optional ! at start of token
    pattern = re.compile(r"<<(!?)([A-Z_]+):\s*\"?(.*?)\"?\s*>>")

    result = defaultdict(list)
    # Keep track of spans to remove them later
    spans_to_remove = []

    for match in pattern.finditer(section_text):
        bang, key, value = match.groups()
        value = value.strip()
        if bang == "!":
            # repeatable, always append
            result[key].append(value)
        else:
            # not repeatable, append for now
            result[key].append(value)
        spans_to_remove.append(match.span())

    # Flatten keys that are not repeatable (only 1 value)
    final_metadata = {}
    for key, values in result.items():
        if len(values) == 1:
            final_metadata[key] = values[0]
        else:
            final_metadata[key] = values

    # Remove metadata tokens from original text
    remaining_text = section_text
    for start, end in reversed(spans_to_remove):
        remaining_text = remaining_text[:start] + remaining_text[end:]
    remaining_text = remaining_text.strip()

    return final_metadata, remaining_text


def generate_chunks(
        slides_text: str,
        file_name: str,
        context: str = '',
        model_name: str = DEFAULT_MODEL_NAME,
        max_retries: int = 10,
):
    """
    Sends slides to AI and returns parsed chunks in token format.
    Retries if CHUNK tokens are missing.
    """

    prompt = build_chunk_request(slides_text, file_name, context.strip())

    for attempt in range(max_retries):
        response = call_openai_model(
            client=get_openai_client(),
            prompt=prompt,
            model_name=model_name,
        )

        sections = parse_sections(response, "CHUNK", repeatable=True)

        if sections:
            parsed_chunks = [parse_metadata(sec)[0] for sec in sections]
            return parsed_chunks

    raise ValueError(
        f"Failed to generate valid CHUNK tokens after {max_retries} attempts."
    )


def generate_summary(chunk_text: str, context: str = '', model_name: str = DEFAULT_MODEL_NAME) -> str:
    """
    Sends a chunk of text to AI and returns a short summary string.
    """
    prompt = build_summarize_prompt(chunk_text, context)

    response = call_openai_model(
        client=get_openai_client(),
        prompt=prompt,
        model_name=model_name,
        temperature=0.0,
    )

    return response.strip()


def generate_quiz_modular(
        chunk_text: str,
        topic_type: str = "Theory",
        format_type: str = "MCQ",
        difficulty: str = "Medium",
        context: str = '',
        model_name: str = DEFAULT_MODEL_NAME,
        max_retries: int = 10,
):
    """
    Sends a chunk to AI and returns a parsed quiz question.
    Retries if required tokens are missing.
    """
    # print(chunk_text[:500])
    prompt = build_quiz_prompt(chunk_text, topic_type, format_type, difficulty, context)
    # print(f"Prompt: \n{prompt}")
    for attempt in range(max_retries):
        response = call_openai_model(
            client=get_openai_client(),
            prompt=prompt,
            model_name=model_name,
        )
        # print(f"Response: {response}")

        # QUESTION
        q_sec = parse_sections(response, "QUESTION", repeatable=False)
        if not q_sec:
            continue

        metadata, remaining_text = parse_metadata(q_sec)

        # OPTION - TEXT questions have no options; skip the check for them
        if format_type == "TEXT":
            options = []
        else:
            options = parse_sections(response, "OPTION", repeatable=True)
            if not options:
                # Fallback: accept <<OPTION>> without ! prefix
                options = re.findall(r"<<OPTION>>\s*(.*?)\s*<</OPTION>>", response, re.DOTALL)
                options = [o.strip() for o in options]
            if not options:
                continue

        # ANSWER
        answer_sec = parse_sections(response, "ANSWER", repeatable=False)
        if not answer_sec:
            continue

        answer = answer_sec.strip()

        # For MULTI, answer must be digits only (e.g. "024"), not a text sentence
        if format_type == "MULTI" and not answer.isdigit():
            continue

        return {
            "metadata": metadata,
            "question_text": remaining_text,
            "options": options,
            "answer": answer,
        }

    raise ValueError(
        f"Failed to generate valid quiz tokens after {max_retries} attempts."
    )


def _normalize_answer(ans: str) -> str:
    return "".join(sorted(ans.strip()))


def grade_single_choice(correct_answer: str, user_answer: str) -> int:
    correct = correct_answer.strip()
    user = user_answer.strip()
    return 10 if user == correct else 0


def grade_multi_answer(correct_answer: str, user_answer: str) -> int:
    correct_set = set(correct_answer.strip())
    user_set = set(user_answer.strip())

    if not correct_set:
        return 0

    # Count correct selections
    correct_hits = len(user_set & correct_set)

    # Count incorrect selections (user picked something not correct)
    wrong_hits = len(user_set - correct_set)

    # Compute score ratio
    score_ratio = (correct_hits - wrong_hits) / len(correct_set)

    # Clamp between 0 and 1
    score_ratio = max(0.0, min(1.0, score_ratio))

    # Scale to 10 and round
    return round(score_ratio * 10)


def grade_nonmcq_quiz(
        question: str,
        correct_answer: str,
        user_answer: str,
        model_name: str = DEFAULT_MODEL_NAME,
):
    prompt = build_grade_prompt(question, correct_answer, user_answer)
    response = call_openai_model(
        client=get_openai_client(),
        prompt=prompt,
        model_name=model_name,
    )
    score = parse_sections(response, "SCORE", repeatable=False)
    return int(score) if score and str(score).isdigit() else 0


def grade_quiz(
        question: str,
        correct_answer: str,
        user_answer: str,
        question_type: str = "MCQ",
        model_name: str = DEFAULT_MODEL_NAME,
):
    if question_type in {"MCQ", "TF"}:
        return grade_single_choice(correct_answer, user_answer)

    if question_type == "MULTI":
        return grade_multi_answer(correct_answer, user_answer)

    if question_type == "TEXT":
        return grade_nonmcq_quiz(question, correct_answer, user_answer, model_name)

    raise ValueError(f"Unsupported question_type: {question_type}")
