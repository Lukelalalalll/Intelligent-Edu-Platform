"""Shared fixtures and configuration for backend tests."""

from __future__ import annotations

import asyncio
import inspect

_TEST_LOOP = None


def pytest_configure(config):
    config.addinivalue_line("markers", "asyncio: run test in an asyncio event loop")


def pytest_sessionstart(session):
    global _TEST_LOOP
    _TEST_LOOP = asyncio.new_event_loop()
    asyncio.set_event_loop(_TEST_LOOP)


def pytest_sessionfinish(session, exitstatus):
    global _TEST_LOOP
    if _TEST_LOOP is not None:
        _TEST_LOOP.close()
        _TEST_LOOP = None


def pytest_pyfunc_call(pyfuncitem):
    test_func = pyfuncitem.obj
    if not inspect.iscoroutinefunction(test_func):
        return None

    kwargs = {
        name: pyfuncitem.funcargs[name]
        for name in pyfuncitem._fixtureinfo.argnames
    }
    _TEST_LOOP.run_until_complete(test_func(**kwargs))
    return True

