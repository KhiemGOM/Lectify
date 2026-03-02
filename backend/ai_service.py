import os
import re
from collections import defaultdict
from typing import Tuple, Dict
from openai import OpenAI
from prompts import build_chunk_request, build_quiz_prompt, build_grade_prompt
from dotenv import load_dotenv


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
    max_tokens: int = 1024,
    system_prompt: str = "You are a helpful assistant.",
) -> str:
    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
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


def parse_metadata(section_text: str) -> Tuple[Dict[str, any], str]:
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

def generate_chunks(slides_text: str, file_name: str, model_name: str = "gpt-4o-mini"):
    """
    Sends slides to AI and returns parsed chunks in token format.
    Each chunk contains metadata like filename, begin/end, etc.
    """
    prompt = build_chunk_request(slides_text, file_name)

    response = call_openai_model(
        client=get_openai_client(),
        prompt=prompt,
        model_name=model_name,
    )

    # Parse sections (repeatable) and extract metadata
    sections = parse_sections(response, "CHUNK", repeatable=True)
    parsed_chunks = [parse_metadata(sec)[0] for sec in sections]

    return parsed_chunks


def generate_summary(chunk_text: str, model_name: str = "gpt-4o-mini") -> str:
    """
    Sends a chunk of text to AI and returns a short summary string.
    """
    prompt = f"""
You are an AI assistant. Summarize the following chunk of slides/text in 3-5 concise sentences.
Just return plain text. Summary only, do not say anything else.

Chunk content:
{chunk_text}
"""

    response = call_openai_model(
        client=get_openai_client(),
        prompt=prompt,
        model_name=model_name,
        temperature=0.0,
        max_tokens=256,
    )

    return response.strip()

def generate_quiz_modular(
        chunk_text: str,
        topic_type: str = "Theory",
        format_type: str = "MCQ",
        model_name: str = "gpt-4o-mini",
):
    """
    Sends a chunk to AI and returns a single parsed quiz question in token format.

    Output tokens example:
        <<QUESTION>> ... <</QUESTION>>
        <<OPTION>> ... <</OPTION>>
        <<ANSWER>> ... <</ANSWER>>
    """

    prompt = build_quiz_prompt(chunk_text, topic_type, format_type)

    response = call_openai_model(
        client=get_openai_client(),
        prompt=prompt,
        model_name=model_name,
    )

    print(response)
    print()

    # Get the single QUESTION section
    q_sec = parse_sections(response, "QUESTION", repeatable=False)
    if not q_sec:
        raise ValueError("No QUESTION token found in AI response.")

    # Parse metadata inside the question
    metadata, remaining_text = parse_metadata(q_sec)

    # Parse options
    options = parse_sections(response, "OPTION", repeatable=True)

    # Parse answer
    answer_sec = parse_sections(response, "ANSWER", repeatable=False)
    answer = answer_sec.strip() if answer_sec else None

    # Build final dict
    quiz_question = {
        "metadata": metadata,
        "question_text": remaining_text,
        "options": options or [],
        "answer": answer,
    }

    return quiz_question



def grade_mcq_quiz(correct_answer: str, user_answer: str) -> int:
    return 10 if user_answer == correct_answer else 0


def grade_nonmcq_quiz(
    question: str,
    correct_answer: str,
    user_answer: str,
    model_name: str = "gpt-4o-mini",
):
    prompt = build_grade_prompt(question, correct_answer, user_answer)
    response = call_openai_model(
        client=get_openai_client(),
        prompt=prompt,
        model_name=model_name,
        temperature=0.0,
        max_tokens=512,
    )
    score = parse_sections(response, "SCORE", repeatable=False)
    return int(score) if score and str(score).isdigit() else 0


def grade_quiz(
    raw_quiz_text: str,
    user_answer: str,
    question_type: str = "MCQ",
    model_name: str = "gpt-4o-mini",
):
    correct_answer = parse_sections(raw_quiz_text, "ANSWER", repeatable=False) or ""
    if question_type == "MCQ":
        return grade_mcq_quiz(correct_answer, user_answer)
    question = parse_sections(raw_quiz_text, "QUESTION", repeatable=False) or ""
    return grade_nonmcq_quiz(question, correct_answer, user_answer, model_name)
