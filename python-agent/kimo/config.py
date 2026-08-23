"""Provider configuration, settings and model-profile resolution.

Mirrors ``assistant/providers.ts`` + ``assistant/modelProfiles.ts``: a provider
can be a built-in one (openai / anthropic / mistral / gemini / deepseek / ollama)
or a user-supplied ``custom:`` endpoint that speaks the OpenAI tool-calling
wire format.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class WireFamily(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    MISTRAL = "mistral-chat"
    GEMINI = "gemini-openai"
    CUSTOM = "custom"


@dataclass
class ProviderDef:
    id: str
    name: str
    color: str = "#888888"
    base_url: str = ""
    default_models: list[str] = field(default_factory=list)
    wire_family: WireFamily = WireFamily.OPENAI

    def to_proxy(
        self,
        base_url: Optional[str] = None,
        name: Optional[str] = None,
    ) -> "ProviderDef":
        return ProviderDef(
            id=self.id,
            name=name or self.name,
            color=self.color,
            base_url=base_url or self.base_url,
            default_models=self.default_models,
            wire_family=self.wire_family,
        )


# Built-in provider catalogue -------------------------------------------------

_BUILTINS: dict[str, ProviderDef] = {
    "openai": ProviderDef(
        id="openai",
        name="OpenAI",
        base_url="https://api.openai.com/v1",
        default_models=["gpt-4o-mini", "gpt-4o"],
        wire_family=WireFamily.OPENAI,
    ),
    "anthropic": ProviderDef(
        id="anthropic",
        name="Anthropic",
        base_url="https://api.anthropic.com/v1",
        default_models=["claude-3-5-sonnet-latest", "claude-3-haiku-20240307"],
        wire_family=WireFamily.ANTHROPIC,
    ),
    "mistral": ProviderDef(
        id="mistral",
        name="Mistral",
        base_url="https://api.mistral.ai/v1",
        default_models=["mistral-large-latest", "mistral-small-latest"],
        wire_family=WireFamily.MISTRAL,
    ),
    "gemini": ProviderDef(
        id="gemini",
        name="Google Gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        default_models=["gemini-2.0-flash", "gemini-1.5-pro"],
        wire_family=WireFamily.GEMINI,
    ),
    "deepseek": ProviderDef(
        id="deepseek",
        name="DeepSeek",
        base_url="https://api.deepseek.com/v1",
        default_models=["deepseek-chat", "deepseek-reasoner"],
        wire_family=WireFamily.OPENAI,
    ),
    "ollama": ProviderDef(
        id="ollama",
        name="Ollama (local)",
        base_url="http://localhost:11434/v1",
        default_models=["llama3.1", "qwen2.5"],
        wire_family=WireFamily.OPENAI,
    ),
}


def default_provider(provider_id: str) -> ProviderDef:
    if provider_id.startswith("custom:"):
        return ProviderDef(
            id="custom",
            name=provider_id.split(":", 1)[1] or "Custom",
            wire_family=WireFamily.CUSTOM,
            base_url="",
        )
    return _BUILTINS.get(provider_id, _BUILTINS["openai"])


def provider_label(provider_id: str, custom_name: Optional[str] = None) -> str:
    if provider_id.startswith("custom:"):
        return custom_name or "Custom"
    return _BUILTINS.get(provider_id, _BUILTINS["openai"]).name


@dataclass
class ModelProfile:
    """Capabilities of a specific (provider, model) pair."""

    supports_parallel_tools: bool = True
    supports_input_audio: bool = False
    wire_family: WireFamily = WireFamily.OPENAI
    max_tokens_default: int = 4000

    @property
    def parallel_tools(self) -> bool:
        return self.supports_parallel_tools


def resolve_profile(provider: ProviderDef, model: str) -> ModelProfile:
    """Resolve capability flags from the provider family + model name.

    The original logic keys off known families and a few model name hints;
    this keeps the same spirit in a small, fast lookup.
    """
    family = provider.wire_family
    m = (model or "").lower()

    # Models that are known to mis-handle parallel tool calls.
    serial_models = ("mistral", "mixtral", "gemma", "phi")
    parallel = not any(tok in m for tok in serial_models)

    # Audio-in-chat is gated to a few families / models.
    audio = family in (WireFamily.GEMINI, WireFamily.MISTRAL, WireFamily.OPENAI) and any(
        tok in m for tok in ("gemini", "whisper", "gpt-4o", "mistral")
    )

    return ModelProfile(
        supports_parallel_tools=parallel,
        supports_input_audio=audio,
        wire_family=family,
        max_tokens_default=4000,
    )


@dataclass
class AgentSettings:
    """User-facing assistant configuration (mirrors ``assistant/store.ts``)."""

    provider_id: str = "openai"
    provider_name: Optional[str] = None
    model: str = "gpt-4o-mini"
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    mode: str = "supervisor"  # supervisor | assistant
    language: str = "ar"
    max_tool_rounds: int = 12
    max_tool_calls: int = 60
    max_runtime_seconds: int = 180
    max_repeated_tool_calls: int = 4

    def active_config(self) -> dict[str, Any]:
        return {
            "providerId": self.provider_id,
            "providerName": self.provider_name or provider_label(self.provider_id),
            "model": self.model,
            "baseUrl": self.base_url or default_provider(self.provider_id).base_url,
            "apiKey": self.api_key,
        }
