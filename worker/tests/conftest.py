"""The worker's modules import each other by bare name (they run from worker/), so the tests do too."""
import os, sys

sys.dont_write_bytecode = True   # worker/__pycache__ is tracked by another lane: never rewrite it
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
