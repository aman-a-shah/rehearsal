from dataclasses import dataclass


@dataclass(frozen=True)
class Line:
    id: str
    sku: str
    quantity: int
    unit_cents: int
    taxable: bool = True

    @property
    def subtotal(self):
        return self.quantity * self.unit_cents
