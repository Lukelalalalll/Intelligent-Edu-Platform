from __future__ import annotations

from bisect import insort

try:
    from tdigest import TDigest as TDigest  # type: ignore
except ModuleNotFoundError:
    class TDigest:
        """Small in-process percentile fallback when tdigest is unavailable."""

        def __init__(self) -> None:
            self._values: list[float] = []

        @property
        def n(self) -> int:
            return len(self._values)

        def weight(self) -> int:
            return len(self._values)

        def update(self, value: float) -> None:
            insort(self._values, float(value))

        def percentile(self, q: float) -> float:
            if not self._values:
                return 0.0

            if q <= 0:
                return self._values[0]
            if q >= 100:
                return self._values[-1]

            rank = (len(self._values) - 1) * (q / 100.0)
            lower = int(rank)
            upper = min(lower + 1, len(self._values) - 1)

            if lower == upper:
                return self._values[lower]

            fraction = rank - lower
            return self._values[lower] + (self._values[upper] - self._values[lower]) * fraction
