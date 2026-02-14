"""
Unified thin driver wrapper around VyOSService.

This preserves existing backend behavior while centralizing the API surface for
future parity work.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pyvyos.core.rest_client import ApiResponse
from vyos_service import VyOSService


class VyOSDriver:
    """
    Thin wrapper around VyOSService.

    Notes:
    - Keeps all existing API contracts by delegating unknown attributes/methods
      to the underlying service.
    - Exposes `apply_operations()` as the unified write entrypoint.
    """

    def __init__(self, service: VyOSService, *, probe_target: Optional[str] = None):
        self._service = service
        self._probe_target = probe_target

    @property
    def service(self) -> VyOSService:
        return self._service

    @property
    def device(self) -> Any:
        return self._service.device

    def set_probe_target(self, probe_target: Optional[str]) -> None:
        self._probe_target = probe_target

    def apply_operations(
        self,
        operations: List[Dict[str, Any]],
        *,
        safe_apply: Optional[bool] = None,
        reason: Optional[str] = None,
    ) -> ApiResponse:
        return self._service.apply_operations(
            operations,
            safe_apply=safe_apply,
            probe_target=self._probe_target,
            reason=reason,
        )

    def __getattr__(self, item: str) -> Any:
        # Backward-compatible passthrough for existing service surface.
        return getattr(self._service, item)

