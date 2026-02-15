"""
Interface API Routers

FastAPI routers for different interface types.
"""

from . import (
    ethernet,
    dummy,
    bonding,
    bridge,
    geneve,
    l2tpv3,
    macsec,
    openvpn,
    pseudo_ethernet,
    sstpc,
    tunnel,
    virtual_ethernet,
    vti,
    vxlan,
)

__all__ = [
    "ethernet",
    "dummy",
    "bonding",
    "bridge",
    "geneve",
    "l2tpv3",
    "macsec",
    "openvpn",
    "pseudo_ethernet",
    "sstpc",
    "tunnel",
    "virtual_ethernet",
    "vti",
    "vxlan",
]
