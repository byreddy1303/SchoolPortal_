from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.payment import FeeComponent


class StudentBase(BaseModel):
    academic_year: str = Field(min_length=4, max_length=20)
    admission_number: str = Field(min_length=1, max_length=50)
    student_name: str = Field(min_length=1, max_length=120)
    father_name: str = Field(min_length=1, max_length=120)
    mother_name: str | None = Field(default=None, max_length=120)
    mobile_number: str = Field(min_length=10, max_length=20)
    class_name: str = Field(min_length=1, max_length=30)
    section: str = Field(min_length=1, max_length=10)
    student_aadhaar: str | None = Field(default=None, max_length=20)
    father_aadhaar: str | None = Field(default=None, max_length=20)
    student_identifier: str | None = Field(default=None, max_length=50)
    pen_number: str | None = Field(default=None, max_length=50)
    admission_fee: Decimal = Decimal("0.00")
    first_term_fee: Decimal = Decimal("0.00")
    second_term_fee: Decimal = Decimal("0.00")
    third_term_fee: Decimal = Decimal("0.00")
    transport_fee: Decimal = Decimal("0.00")
    books_fee: Decimal = Decimal("0.00")
    concession_transport: Decimal = Decimal("0.00")

    @field_validator(
        "admission_fee",
        "first_term_fee",
        "second_term_fee",
        "third_term_fee",
        "transport_fee",
        "books_fee",
        "concession_transport",
        mode="before",
    )
    @classmethod
    def validate_money(cls, value: Decimal | str | int | float) -> Decimal:
        amount = Decimal(value)
        if amount < 0:
            raise ValueError("Amount cannot be negative")
        return amount.quantize(Decimal("0.01"))

    @field_validator("concession_transport")
    @classmethod
    def validate_concession(cls, value: Decimal, info) -> Decimal:
        transport_fee = info.data.get("transport_fee", Decimal("0.00"))
        if value > transport_fee:
            raise ValueError("Transport concession cannot exceed transport fee")
        return value

    @field_validator("mobile_number", mode="before")
    @classmethod
    def normalize_mobile_number(cls, value: str) -> str:
        digits_only = "".join(character for character in str(value) if character.isdigit())
        if len(digits_only) != 10:
            raise ValueError("Mobile number must contain exactly 10 digits")
        return digits_only

    @field_validator("student_aadhaar", "father_aadhaar", mode="before")
    @classmethod
    def normalize_aadhaar(cls, value: str | None) -> str | None:
        if value is None:
            return None

        digits_only = "".join(character for character in str(value) if character.isdigit())
        if not digits_only:
            return None
        if len(digits_only) != 12:
            raise ValueError("Aadhaar number must contain exactly 12 digits")
        return digits_only


class StudentCreate(StudentBase):
    pass


class StudentUpdate(StudentBase):
    pass


class FeeComponentStatus(BaseModel):
    component: FeeComponent
    label: str
    assessed: Decimal
    paid: Decimal
    balance: Decimal


class FeeSummary(BaseModel):
    total_fee: Decimal
    concession_transport: Decimal
    adjusted_total: Decimal
    total_paid: Decimal
    total_pending: Decimal
    components: list[FeeComponentStatus]


class PaymentAllocationCreate(BaseModel):
    component: FeeComponent
    amount: Decimal

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, value: Decimal | str | int | float) -> Decimal:
        amount = Decimal(value)
        if amount <= 0:
            raise ValueError("Amount must be greater than zero")
        return amount.quantize(Decimal("0.01"))


class PaymentTransactionCreate(BaseModel):
    received_on: date
    note: str | None = Field(default=None, max_length=255)
    allocations: list[PaymentAllocationCreate]

    @field_validator("allocations")
    @classmethod
    def validate_allocations(cls, value: list[PaymentAllocationCreate]) -> list[PaymentAllocationCreate]:
        if not value:
            raise ValueError("At least one payment allocation is required")
        components = [item.component for item in value]
        if len(components) != len(set(components)):
            raise ValueError("Duplicate fee components are not allowed in one payment")
        return value


class PaymentAllocationRead(BaseModel):
    id: int
    component: FeeComponent
    amount: Decimal

    model_config = ConfigDict(from_attributes=True)


class PaymentTransactionRead(BaseModel):
    id: int
    receipt_number: str
    created_by_username: str | None
    received_on: date
    note: str | None
    created_at: datetime
    allocations: list[PaymentAllocationRead]

    model_config = ConfigDict(from_attributes=True)


class StudentListItem(BaseModel):
    id: int
    academic_year: str
    admission_number: str
    student_name: str
    class_name: str
    section: str
    mobile_number: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClassSectionOption(BaseModel):
    academic_year: str
    class_name: str
    section: str


class StudentDueListItem(StudentListItem):
    total_pending: Decimal

    model_config = ConfigDict(from_attributes=True)


class StudentRead(BaseModel):
    id: int
    academic_year: str
    admission_number: str
    student_name: str
    father_name: str
    mother_name: str | None
    mobile_number: str
    class_name: str
    section: str
    student_aadhaar: str | None
    father_aadhaar: str | None
    student_identifier: str | None
    pen_number: str | None
    admission_fee: Decimal
    first_term_fee: Decimal
    second_term_fee: Decimal
    third_term_fee: Decimal
    transport_fee: Decimal
    books_fee: Decimal
    concession_transport: Decimal
    created_at: datetime
    updated_at: datetime
    fee_summary: FeeSummary
    payment_transactions: list[PaymentTransactionRead]

    model_config = ConfigDict(from_attributes=True)
