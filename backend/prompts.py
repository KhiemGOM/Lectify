CHUNK_PROMPT = """
You are an AI that converts slides into logical content units.

Instructions:
- For each CHUNK, reason and decide which range of slide it should includes.
- Output each chunk as an **empty structured section**, with only metadata tokens.
- AI reasoning MUST appear outside the tokens.
- AI MUST reason about chunk choice before any token begin.
- Use the following token format strictly:

<<!CHUNK>>
<<FILENAME:"filename_here">>
<<CHUNKBEGIN:begin_slide_number_inclusive>>
<<CHUNKEND:end_slide_number_inclusive>>
<</!CHUNK>>

- Each CHUNK must correspond to one unit of content. Make sure length fall in 5-10 slides.
- MAKE SURE that each CHUNK should NOT be too long, and NO LONGER than 20 slides (HARD CAP).
- Multiple CHUNKs should be output as multiple <<!CHUNK>> ... <</!CHUNK>> blocks.
- DO NOT include unnecessary whitespace character.
- DO NOT include any other text inside the token blocks.
- CHUNK must not overlap.
- CHUNK could skip over introductory or overview slides. But any slide that contain any knowledge or content must be put inside a chunk.
"""

THEORY_PROMPT = """
Task: Generate questions based purely on the content of the slide (Theory).
Reason outside the token blocks only. Do not include any reasoning inside tokens.
"""

APPLIED_PROMPT = """
Task: Generate questions that apply the slide content to a broader context (Applied).
Reason outside the token blocks only. Do not include reasoning inside tokens.
"""

MCQ_PROMPT = """
Output format for Multiple Choice Question:

(thinking and planning here)

<<QUESTION>>
<<!SLIDE:the slide number here>>
<<!SLIDE:additional slide numbers if needed>>
Write the question text here
<</QUESTION>>

<<!TOPIC>>topic 1<</!TOPIC>>
<<!TOPIC>>topic 2<</!TOPIC>>
<<!TOPIC>>topic 3<</!TOPIC>>

<<!OPTION>>Option 1<</!OPTION>>
<<!OPTION>>Option 2<</!OPTION>>
<<!OPTION>>Option 3<</!OPTION>>
<<!OPTION>>Option 4<</!OPTION>>
<<ANSWER>>0/1/2/3<</ANSWER>>

Rules:
- Must strictly follow this token structure.
- No extra text inside tokens.
- Include relevant <<!TOPIC>>...<</!TOPIC>> blocks.
- Topics must be short, concise noun phrases.
- Provide only one clear true option, and provide only one answer.
"""

TEXT_PROMPT = """
Output format:

(thinking and planning here)

<<QUESTION>>
<<!SLIDE:the slide number here>>
<<!SLIDE:additional slide numbers if needed>>
<<FORMAT:TEXT/LATEX/CODE>>
Write the question text here.
<</QUESTION>>
<<ANSWER>>
Modal answer
<</ANSWER>>

<<!TOPIC>>topic 1<</!TOPIC>>
<<!TOPIC>>topic 2<</!TOPIC>>
<<!TOPIC>>topic 3<</!TOPIC>>

Rules:
- Must strictly follow this token structure.
- AI resoning should not appear within tokens ("<<" and ">>")
- The question should be concise, specific, and clear in what directions and answers are expected. Do not phrase question generically.
- The question should strictly be a constructed-response question
- Choose the format for the answer you expected correctly: TEXT is for generic plain text answer; LATEX is ONLY for maths expression, or result of calculation answer (a number); CODE is for code answer.
- MUST include relevant <<!TOPIC>>...<</!TOPIC>> blocks.
- Topics must be short, concise noun phrases.
"""

TF_PROMPT = """
Output format for True False question:

(thinking and planning here)

<<QUESTION>>
<<!SLIDE:the slide number here>>
<<!SLIDE:additional slide numbers if needed>>
Write the statement here. It must be clearly True or False question.
<</QUESTION>>

<<!TOPIC>>topic 1<</!TOPIC>>
<<!TOPIC>>topic 2<</!TOPIC>>

<<!OPTION>>True<</!OPTION>>
<<!OPTION>>False<</!OPTION>>
<<ANSWER>>0/1<</ANSWER>>

Rules:
- Must strictly follow this token structure.
- The statement must be unambiguous.
- <<ANSWER>> must be 0 (False) or 1 (True).
- Include relevant <<!TOPIC>>...<</!TOPIC>> blocks.
- Topics must be short, concise noun phrases.
- No extra text inside tokens.
"""

MULTI_PROMPT = """
Output format for Multiple Answer Question:

(thinking and planning here)

<<QUESTION>>
<<!SLIDE:the slide number here>>
<<!SLIDE:additional slide numbers if needed>>
Write the question text here. It must require selecting potentially multiple correct answers.
<</QUESTION>>

<<!TOPIC>>topic 1<</!TOPIC>>
<<!TOPIC>>topic 2<</!TOPIC>>
<<!TOPIC>>topic 3<</!TOPIC>>

<<!OPTION>>Option 1<</!OPTION>>
<<!OPTION>>Option 2<</!OPTION>>
<<!OPTION>>Option 3<</!OPTION>>
<<!OPTION>>Option 4<</!OPTION>>
<<!OPTION>>Option 5<</!OPTION>>

<<ANSWER>>0123<</ANSWER>>

Rules:
- Must strictly follow this token structure.
- There must be at least 2 correct answers.
- <<ANSWER>> must be single digit number altogether (e.g., 023).
- Indices must match option positions exactly.
- No spaces inside <<ANSWER>> (e.g., use 02 not 0, 2).
- So DO NOT use any answer that is more than 9.
- Include relevant <<!TOPIC>>...<</!TOPIC>> blocks.
- Topics must be short, concise noun phrases.
- No extra text inside tokens.
"""

GRADE_TEXT_PROMPT = """
You are a knowledge grader. You will be provided with:

1) A question
2) A model answer
3) A user's answer

Your task is to evaluate whether the user's answer demonstrates correct understanding of the concepts required by the question.

Evaluation principles:
- The question is the primary reference.
- The model answer is a conceptual benchmark.
- Focus only on conceptual correctness and understanding: how well the response answers the question, and more importantly, how well the response demonstrates the student's understanding of the question and related concept is enough
- Do NOT evaluate writing style, structure, grammar, polish, verbosity or length.
- Do NOT penalize brevity if the core concept is correct.
- Deduct points for:
  - Conceptual errors
  - Misinterpretations
  - Missing required KEY ideas (should be marginal in point deduction)
  - Logical contradictions

Scoring:
- Score must be an integer from 0 to 10.
- 0 = conceptually incorrect or irrelevant.
- 10 = fully correct UNDERSTANDING of the required concepts.
- Intermediate scores reflect partial UNDERSTANDING.

Output format:

(thinking and planning here)
<<SCORE>>X<</SCORE>>

Rules:
- Must strictly follow this output structure.
- No extra text inside tokens.
"""


def build_chunk_request(slides_text: str, file_name: str) -> str:
    return f'{CHUNK_PROMPT}\n\nFILENAME:"{file_name}"\n\nSLIDES:\n{slides_text}'


def build_quiz_prompt(
        chunk_text: str,
        topic_type: str,
        format_type: str,
) -> str:
    # Topic selection
    topic_prompt = THEORY_PROMPT if topic_type == "Theory" else APPLIED_PROMPT

    # Format selection
    format_map = {
        "MCQ": MCQ_PROMPT,
        "TF": TF_PROMPT,
        "MULTI": MULTI_PROMPT,
        "TEXT": TEXT_PROMPT,  # if you still support it
    }

    if format_type not in format_map:
        raise ValueError(f"Unsupported format_type: {format_type}")

    format_prompt = format_map[format_type]
    return f"""
    You are a quiz-generating AI. You should only generate ONE question.
    - The question should be related to the slides and you should be able to add citation back to the slides where the knowledge being tested come from using the <<!SLIDE:SLIDENUMBER>> token.
    - The metadata token <<!SLIDE:1/2/3/...>> (the "!") mean that you can add more than 1 slide in citation so please include all relevant slides in the question.
    - The content can span multiple slide but your question can focus on cross slide knowledge or just 1 sentence in 1 slide, it is up to you but please cite the slide number accordingly.
    - DO NOT put answer inside the question token, the question token should only include slide meta data, and ONE question only.
    - AI reasoning MUST appear outside the tokens.
    - AI MUST reason and plan the question and answer option before any token begin.
    - DO NOT include unnecessary whitespace character.

    {topic_prompt}

    You must follow this token format strictly, otherwise use text freely:

    {format_prompt}

    Here is the content from the slides:

    {chunk_text}
    """


def build_grade_prompt(question: str, correct_answer: str, user_answer: str) -> str:
    return f"""
    {GRADE_TEXT_PROMPT}

    Question:
    {question}

    Model Answer:
    {correct_answer}

    User Answer:
    {user_answer}
    """