from __future__ import annotations

import ast
import os
from pathlib import Path
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parent.parent
SERVICE_ROOT = REPO_ROOT / "services" / "bannerbuilder"
MAXIMUM_FUNCTION_LINES = 120


def bannerbuilder_python() -> str:
    candidates = [
        SERVICE_ROOT / ".venv" / "Scripts" / "python.exe",
        SERVICE_ROOT / ".venv" / "bin" / "python",
    ]
    return str(next((candidate for candidate in candidates if candidate.is_file()), Path(sys.executable)))


def bannerbuilder_sources() -> list[Path]:
    sources: list[Path] = []
    for directory, child_directories, filenames in os.walk(SERVICE_ROOT):
        child_directories[:] = [
            name
            for name in child_directories
            if name not in {".venv", "__pycache__"} and not name.startswith("tmp")
        ]
        directory_path = Path(directory)
        sources.extend(directory_path / name for name in filenames if name.endswith(".py"))
    return sorted(sources)


def bytecode_files(sources: list[Path]) -> set[Path]:
    files: set[Path] = set()
    for source in sources:
        cache_directory = source.parent / "__pycache__"
        if cache_directory.is_dir():
            files.update(cache_directory.glob(f"{source.stem}.*.pyc"))
    return files


def check_function_sizes(sources: list[Path]) -> None:
    violations: list[str] = []
    for source in sources:
        tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                continue
            line_count = (node.end_lineno or node.lineno) - node.lineno + 1
            if line_count > MAXIMUM_FUNCTION_LINES:
                relative_path = source.relative_to(REPO_ROOT).as_posix()
                violations.append(f"{relative_path}:{node.lineno} {node.name} spans {line_count} lines")

    if violations:
        details = "\n".join(violations)
        raise SystemExit(
            f"Bannerbuilder functions must stay within {MAXIMUM_FUNCTION_LINES} lines:\n{details}"
        )


def run(command: list[str], *, environment: dict[str, str]) -> None:
    result = subprocess.run(command, cwd=SERVICE_ROOT, env=environment, check=False)
    if result.returncode:
        raise SystemExit(result.returncode)


def main() -> None:
    sources = bannerbuilder_sources()
    if not sources:
        raise SystemExit("No Bannerbuilder Python sources were found.")
    check_function_sizes(sources)

    environment = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    python = bannerbuilder_python()
    bytecode_before = bytecode_files(sources)
    try:
        relative_sources = [str(source.relative_to(SERVICE_ROOT)) for source in sources]
        run([python, "-m", "compileall", "-q", *relative_sources], environment=environment)
        run(
            [
                python,
                "-m",
                "unittest",
                "discover",
                "-s",
                "tests",
                "-p",
                "test_*.py",
                "-v",
            ],
            environment=environment,
        )
    finally:
        for bytecode in bytecode_files(sources) - bytecode_before:
            bytecode.unlink(missing_ok=True)
        for directory in sorted({source.parent / "__pycache__" for source in sources}, reverse=True):
            try:
                directory.rmdir()
            except (FileNotFoundError, OSError):
                pass


if __name__ == "__main__":
    main()
