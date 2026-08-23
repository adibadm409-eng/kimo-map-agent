"""Provider configuration, settings and model-profile resolution.

Supports every provider the original Property Manager app ships with
(gemini, openai, anthropic, mistral, deepseek, alibaba, openrouter, nvidia,
ollama, custom), plus the capability detection that keeps tool calling
reliable: which wire family, parallel-tool support, streaming, vision/audio,
and the correct max-tokens field name.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class WireFamily(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini-openai"
    ALIBABA = "alibaba-openai"
    CUSTOM = "custom"


@dataclass
class ProviderDef:
    id: str
    name: str
    color: str = "#888888"
    base_url: str = ""
    default_models: list[str] = field(default_factory=list)
    wire_family: WireFamily = WireFamily.OPENAI
    models_kind: str = "openai"  # openai | gemini | anthropic | none
    hint: str = ""

    def to_proxy(self, base_url: Optional[str] = None, name: Optional[str] = None) -> "ProviderDef":
        return ProviderDef(
            id=self.id,
            name=name or self.name,
            color=self.color,
            base_url=base_url or self.base_url,
            default_models=self.default_models,
            wire_family=self.wire_family,
            models_kind=self.models_kind,
            hint=self.hint,
        )


# Full provider catalogue (mirrors assistant/providers.ts) --------------------

_BUILTINS: dict[str, ProviderDef] = {
    "gemini": ProviderDef(
        id="gemini", name="جوجل جيميني", color="#4285F4",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        default_models=["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.1-pro-preview"],
        wire_family=WireFamily.GEMINI, models_kind="gemini",
        hint="مفتاح API من aistudio.google.com — الواجهة المتوافقة مع OpenAI",
    ),
    "openai": ProviderDef(
        id="openai", name="OpenAI", color="#10A37F",
        base_url="https://api.openai.com/v1",
        default_models=["gpt-4o-mini", "gpt-4o", "gpt-5.5", "gpt-5.4-mini"],
        wire_family=WireFamily.OPENAI, models_kind="openai",
    ),
    "anthropic": ProviderDef(
        id="anthropic", name="Anthropic Claude", color="#D97757",
        base_url="https://api.anthropic.com/v1",
        default_models=["claude-sonnet-4-5-20250929", "claude-opus-4-1-20250805", "claude-haiku-4-5-20251001"],
        wire_family=WireFamily.ANTHROPIC, models_kind="anthropic",
    ),
    "mistral": ProviderDef(
        id="mistral", name="مستـرال", color="#F50000",
        base_url="https://api.mistral.ai/v1",
        default_models=["mistral-large-2-latest", "mistral-medium-2-latest", "codestral-2-latest"],
        wire_family=WireFamily.OPENAI, models_kind="openai",
    ),
    "deepseek": ProviderDef(
        id="deepseek", name="ديب سيك", color="#4D6BFE",
        base_url="https://api.deepseek.com/v1",
        default_models=["deepseek-chat", "deepseek-v4-flash", "deepseek-v4-pro"],
        wire_family=WireFamily.OPENAI, models_kind="openai",
    ),
    "alibaba": ProviderDef(
        id="alibaba", name="داش سكوب (علي بابا)", color="#FF6A00",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        default_models=["qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus", "qwen3.5-flash"],
        wire_family=WireFamily.ALIBABA, models_kind="none",
        hint="مفتاح API من bailian.console.aliyun.com (نموذج SK-...)",
    ),
    "openrouter": ProviderDef(
        id="openrouter", name="أوبن روتـر", color="#8B5CF6",
        base_url="https://openrouter.ai/api/v1",
        default_models=["openrouter/free", "nvidia/nemotron-3-ultra-550b-a55b:free", "google/gemma-4-31b-it:free"],
        wire_family=WireFamily.OPENAI, models_kind="openai",
        hint="مفتاح API من openrouter.ai/keys — موديلات مجانية بدون بطاقة",
    ),
    "nvidia": ProviderDef(
        id="nvidia", name="NVIDIA NIM", color="#76B900",
        base_url="https://integrate.api.nvidia.com/v1",
        default_models=["meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-ultra-253b-v1"],
        wire_family=WireFamily.OPENAI, models_kind="openai",
        hint="مفتاح API من build.nvidia.com",
    ),
    "ollama": ProviderDef(
        id="ollama", name="Ollama (محلي)", color="#000000",
        base_url="http://localhost:11434/v1",
        default_models=["llama3.1", "qwen2.5", "mistral"],
        wire_family=WireFamily.OPENAI, models_kind="openai",
    ),
}


def default_provider(provider_id: str) -> ProviderDef:
    if provider_id.startswith("custom:"):
        return ProviderDef(id="custom", name="مزود مخصص", wire_family=WireFamily.CUSTOM, models_kind="openai")
    return _BUILTINS.get(provider_id, _BUILTINS["openai"])


def provider_label(provider_id: str, custom_name: Optional[str] = None) -> str:
    if provider_id.startswith("custom:"):
        return custom_name or "مزود مخصص"
    return _BUILTINS.get(provider_id, _BUILTINS["openai"]).name


# --- model capabilities (mirrors providerCapabilities) -----------------------


@dataclass
class ModelProfile:
    """Per-(provider, model) capability + behaviour flags."""

    supports_parallel_tools: bool = True
    supports_input_audio: bool = False
    supports_streaming: bool = True
    supports_tools: bool = True
    supports_vision: bool = False
    wire_family: WireFamily = WireFamily.OPENAI
    max_tokens_field: str = "max_tokens"  # max_tokens | max_completion_tokens
    preserves_thought_signatures: bool = False
    max_tokens_default: int = 4000
    audio_formats: list[str] = field(default_factory=list)

    @property
    def parallel_tools(self) -> bool:
        return self.supports_parallel_tools


_SERIAL_MODELS = ("mistral", "mixtral", "gemma", "phi", "nemotron")
_AUDIO_MODELS = (
    "gemini", "whisper", "gpt-4o", "voxtral", "qwen.*(?:omni|audio)",
    "gpt-oss", "audio",
)


def _matches_any(text: str, patterns: tuple[str, ...]) -> bool:
    import re

    return any(re.search(p, text) for p in patterns)


def resolve_profile(provider: ProviderDef, model: str) -> ModelProfile:
    """Resolve capability flags from the provider family + model name."""
    family = provider.wire_family
    m = (model or "").lower()

    # Parallel tool support is fragile on several families/models.
    parallel = provider.id != "custom" and not _matches_any(m, _SERIAL_MODELS)

    audio = family in (WireFamily.GEMINI, WireFamily.OPENAI) and _matches_any(
        m, ("gemini", "whisper", "gpt-4o", "voxtral", "gpt-oss")
    )
    audio_formats = ["wav", "mp3", "m4a", "webm"] if audio else []

    # Newer OpenAI-style models expect max_completion_tokens.
    newer_openai = (
        provider.id in ("openai", "openrouter", "custom")
        and (m.startswith("gpt-5") or m.startswith("o1") or m.startswith("o3"))
    ) or (provider.id == "alibaba" and _matches_any(m, (r"qwen3\.[5-9]", r"glm-5", r"kimi-k2\.[5-9]", r"deepseek-v4")))
    max_tokens_field = "max_completion_tokens" if newer_openai else "max_tokens"

    vision = _matches_any(
        m,
        (r"gpt-4o", r"gpt-5", r"^o[1-9]", r"gemini", r"pixtral", r"mistral-small-3\.1", r"qwen.*(?:vl|omni)", r"vision", r"vl"),
    ) and provider.id not in ("deepseek",)

    return ModelProfile(
        supports_parallel_tools=parallel,
        supports_input_audio=audio,
        supports_streaming=provider.id != "custom",
        supports_tools=True,
        supports_vision=vision,
        wire_family=family,
        max_tokens_field=max_tokens_field,
        preserves_thought_signatures=family == WireFamily.GEMINI,
        max_tokens_default=4000,
        audio_formats=audio_formats,
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
    max_history_messages: int = 40
    temperature: float = 0.2
    max_tokens: int = 4000

    def active_config(self) -> dict[str, Any]:
        return {
            "providerId": self.provider_id,
            "providerName": self.provider_name or provider_label(self.provider_id),
            "model": self.model,
            "baseUrl": self.base_url or default_provider(self.provider_id).base_url,
            "apiKey": self.api_key,
        }
