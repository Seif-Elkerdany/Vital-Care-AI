"""Canonical backend package for MedAPP."""

from .bootstrap import build_service, create_app, main, parse_args

__all__ = ["build_service", "create_app", "main", "parse_args"]
