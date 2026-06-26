from app.core.enums import BasketStatus


def get_next_status(current_status: str, event: str) -> str:
    """
    Very simple state machine transitions for Baskets.
    """
    transitions = {
        BasketStatus.OPENING: {
            "bo_filled": BasketStatus.OPEN,
            "error": BasketStatus.ERROR,
            "cancel": BasketStatus.CLOSED,
        },
        BasketStatus.OPEN: {
            "tp_filled": BasketStatus.CLOSING,
            "liquidated": BasketStatus.LIQUIDATED,
            "error": BasketStatus.ERROR,
            "emergency_close": BasketStatus.CLOSING,
        },
        BasketStatus.CLOSING: {"all_closed": BasketStatus.CLOSED, "error": BasketStatus.ERROR},
    }

    try:
        return transitions[current_status][event]
    except KeyError:
        return current_status  # Invalid transition, remain in current state
