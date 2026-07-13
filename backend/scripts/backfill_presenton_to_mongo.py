from __future__ import annotations

import argparse


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Legacy Presenton projection backfill entrypoint."
    )
    parser.add_argument(
        "--owner-user-id",
        required=False,
        help="Ignored compatibility argument kept for legacy callers.",
    )
    parser.add_argument(
        "--presentation-id",
        action="append",
        default=[],
        help="Ignored compatibility argument kept for legacy callers.",
    )
    return parser.parse_args()


def main() -> None:
    _parse_args()
    print(
        "[presenton-backfill] Mongo projection has been retired; "
        "Presenton data now reads directly from SQL, so no backfill is performed."
    )


if __name__ == "__main__":
    main()
