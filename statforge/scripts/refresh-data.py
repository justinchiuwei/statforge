"""Refresh StatForge data, retrain prior-season models and regenerate evaluation.
Uses the same arguments as train-pipeline.py.
"""
import pathlib, runpy
runpy.run_path(str(pathlib.Path(__file__).with_name('train-pipeline.py')), run_name='__main__')
