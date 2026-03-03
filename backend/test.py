import asyncio
from io import BytesIO

from fastapi import UploadFile

from ai_service import generate_quiz_modular, generate_chunks, parse_metadata, parse_sections
from model_config import DEFAULT_MODEL_NAME
from document_processor import process_uploaded_file


class FakeUploadFile(UploadFile):
    """
    Minimal wrapper to simulate FastAPI UploadFile
    """

    def __init__(self, filename: str, file_bytes: bytes):
        super().__init__(filename=filename, file=BytesIO(file_bytes))


async def test_file_processing(file_path: str):
    # Read file from disk
    with open(file_path, "rb") as f:
        file_bytes = f.read()

    filename = file_path.split("/")[-1]

    fake_file = FakeUploadFile(filename=filename, file_bytes=file_bytes)

    result = await process_uploaded_file(fake_file)

    print("\n===== PROCESSING RESULT =====")
    print("Filename:", result["filename"])
    print("File type:", result["file_type"])
    print("Sections count:", len(result["sections"]))

    print("\nFirst section preview:")
    print(result["sections"][1]["content"][:5000])

async def test_chunk_generation(file_path: str):
    # Simulate upload
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    filename = file_path.split("/")[-1]
    fake_file = FakeUploadFile(filename=filename, file_bytes=file_bytes)

    # Process file
    result = await process_uploaded_file(fake_file)
    slides_text = "\n\n".join(
        f"Slide {sec['section_id']}:\n{sec['content']}"
        for sec in result["sections"]
    )

    # Generate chunks
    raw_chunks = generate_chunks(slides_text, filename, model_name=DEFAULT_MODEL_NAME)

    print("\n===== GENERATED CHUNKS =====")
    for i, chunk in enumerate(raw_chunks):
        print(f"\n--- Chunk {i+1} ---")
        print("Metadata:", chunk.get("metadata", chunk))
        begin_idx = int(chunk["CHUNKBEGIN"])
        end_idx = int(chunk["CHUNKEND"])

        chunk_content = "\n\n".join(
            f"Slide {i+1}:\n{sec['content']}"
            for i, sec in enumerate(result["sections"][begin_idx:end_idx+1], start=begin_idx)
        )

        print("Content preview:", chunk_content[:500])

async def test_quiz_generation(file_path: str):
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    filename = file_path.split("/")[-1]
    fake_file = FakeUploadFile(filename=filename, file_bytes=file_bytes)

    # Process file
    result = await process_uploaded_file(fake_file)
    slides_text = "\n".join(sec["content"] for sec in result["sections"])

    # Generate chunks
    raw_chunks = generate_chunks(slides_text, filename, model_name=DEFAULT_MODEL_NAME)
    first_chunk = raw_chunks[0]

    # Extract actual chunk content
    begin_idx = int(first_chunk["CHUNKBEGIN"])
    end_idx = int(first_chunk["CHUNKEND"])

    # Grab all the slides in that chunk
    chunk_content = "\n\n".join(
        f"Slide {i+1}:\n{sec['content']}"
        for i, sec in enumerate(result["sections"][begin_idx:end_idx+1], start=begin_idx)
    )

    # Generate quiz
    quiz = generate_quiz_modular(chunk_content, topic_type="Theory", format_type="MCQ")

    print("\n===== QUIZ FROM FIRST CHUNK =====")
    print("Question:", quiz["question_text"])
    print("Options:", quiz["options"])
    print("Answer:", quiz["answer"])
    print("Metadata:", quiz["metadata"])

if __name__ == "__main__":
    import asyncio

    file_path = "./.test/01_w1_Data_Science_Overview.pdf"  # your file
    # asyncio.run(test_file_processing(file_path))
    # asyncio.run(test_chunk_generation(file_path))
    asyncio.run(test_quiz_generation(file_path))
