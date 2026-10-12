import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Gamepad2,
  Heart,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { api } from "../../api/client";
import type {
  Catalog,
  CatalogItem,
  DatingUpdate,
  SocialUpdate,
} from "../../api/types";
import { useAuth } from "../../contexts/AuthContext";
import { errorMessage, labelFor } from "../../i18n/vi";
import {
  CosmicButton,
  ErrorState,
  GlassCard,
  LoadingIndicator,
} from "../../components/ui/cosmic";
import "../../styles/profile.css";

type ProfileTab = "social" | "dating";
type Feedback = { kind: "success" | "error"; text: string } | null;

function sameProfile(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function socialInput(value: SocialUpdate): SocialUpdate {
  return {
    bio: value.bio,
    enabled: value.enabled,
    readyToConnect: value.readyToConnect,
    goals: [...value.goals],
    interests: [...value.interests],
    games: value.games.map((game) => ({ ...game })),
  };
}

function datingInput(value: DatingUpdate): DatingUpdate {
  return {
    bio: value.bio,
    enabled: value.enabled,
    visibility: value.visibility,
    intentCode: value.intentCode,
    preferredMinAge: value.preferredMinAge,
    preferredMaxAge: value.preferredMaxAge,
    interests: [...value.interests],
    values: [...value.values],
    acceptedIntents: [...value.acceptedIntents],
  };
}

function displayItem(item: CatalogItem) {
  const translated = labelFor(item.code);
  return translated === item.code ? item.label : translated;
}

function SelectionGroup({
  title,
  description,
  items,
  selected,
  onChange,
  max,
}: {
  title: string;
  description?: string;
  items: CatalogItem[];
  selected: string[];
  onChange: (values: string[]) => void;
  max: number;
}) {
  return (
    <fieldset className="profile-choice-group">
      <legend>
        {title}
        <span>{selected.length} đã chọn</span>
      </legend>
      {description && <p className="profile-help">{description}</p>}
      <div className="profile-choice-list">
        {items.map((item) => {
          const checked = selected.includes(item.code);
          return (
            <label
              key={item.code}
              className={`profile-choice ${checked ? "is-selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && selected.length >= max}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((code) => code !== item.code)
                      : [...selected, item.code],
                  )
                }
              />
              <span className="profile-choice-mark" aria-hidden="true">
                {checked ? <Check size={13} /> : <Plus size={13} />}
              </span>
              {displayItem(item)}
            </label>
          );
        })}
        {items.length === 0 && (
          <p className="profile-help">Chưa có lựa chọn trong danh mục.</p>
        )}
      </div>
    </fieldset>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  title,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="profile-toggle-row" htmlFor={id}>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="profile-toggle">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="profile-toggle-track" aria-hidden="true">
          <span />
        </span>
      </span>
    </label>
  );
}

function BioField({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="profile-field">
      <label htmlFor={id}>Đôi lời về bạn</label>
      <textarea
        id={id}
        rows={4}
        maxLength={500}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-describedby={`${id}-count`}
      />
      <div className="profile-field-caption">
        <span>Một lời giới thiệu nhỏ để bắt đầu kết nối.</span>
        <span id={`${id}-count`}>{value.length}/500</span>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { token, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: ProfileTab =
    searchParams.get("mode") === "dating" ? "dating" : "social";
  const setTab = (nextTab: ProfileTab) =>
    setSearchParams({ mode: nextTab }, { replace: true });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [social, setSocial] = useState<SocialUpdate | null>(null);
  const [dating, setDating] = useState<DatingUpdate | null>(null);
  const [savedSocial, setSavedSocial] = useState<SocialUpdate | null>(null);
  const [savedDating, setSavedDating] = useState<DatingUpdate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState<ProfileTab | null>(null);
  const [feedback, setFeedback] = useState<Record<ProfileTab, Feedback>>({
    social: null,
    dating: null,
  });
  const activeToken = useRef(token);
  activeToken.current = token;
  const saveLock = useRef(false);
  const socialDirty = social !== null && !sameProfile(social, savedSocial);
  const datingDirty = dating !== null && !sameProfile(dating, savedDating);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    Promise.all([
      api.getCatalog(token, controller.signal),
      api.getSocialProfile(token, controller.signal),
      api.getDatingProfile(token, controller.signal),
    ])
      .then(([nextCatalog, nextSocial, nextDating]) => {
        if (controller.signal.aborted) return;
        setCatalog(nextCatalog);
        setSocial(socialInput(nextSocial));
        setSavedSocial(socialInput(nextSocial));
        setDating(datingInput(nextDating));
        setSavedDating(datingInput(nextDating));
        setFeedback({ social: null, dating: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, retry]);

  useEffect(() => {
    if (!socialDirty && !datingDirty) return;
    const preventDiscard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventDiscard);
    return () => window.removeEventListener("beforeunload", preventDiscard);
  }, [socialDirty, datingDirty]);

  function editSocial(patch: Partial<SocialUpdate>) {
    setSocial((value) => (value ? { ...value, ...patch } : value));
    setFeedback((value) => ({ ...value, social: null }));
  }

  function editDating(patch: Partial<DatingUpdate>) {
    setDating((value) => (value ? { ...value, ...patch } : value));
    setFeedback((value) => ({ ...value, dating: null }));
  }

  function showFeedback(
    target: ProfileTab,
    kind: "success" | "error",
    text: string,
  ) {
    setFeedback((value) => ({ ...value, [target]: { kind, text } }));
  }

  async function saveSocial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !social || saveLock.current) return;
    if (
      new Set(
        social.games.map((game) => `${game.gameCode}:${game.platformCode}`),
      ).size !== social.games.length
    ) {
      showFeedback(
        "social",
        "error",
        "Mỗi trò chơi và nền tảng chỉ được chọn một lần. Hãy xóa mục bị trùng.",
      );
      return;
    }
    saveLock.current = true;
    setSaving("social");
    try {
      const result = await api.updateSocialProfile(token, socialInput(social));
      if (activeToken.current !== token) return;
      setSocial(socialInput(result));
      setSavedSocial(socialInput(result));
      showFeedback(
        "social",
        "success",
        "Đã lưu hồ sơ kết bạn. Bạn có thể khám phá những người cùng sở thích.",
      );
    } catch (error) {
      if (activeToken.current === token)
        showFeedback("social", "error", errorMessage(error));
    } finally {
      setSaving(null);
      saveLock.current = false;
    }
  }

  async function saveDating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !dating || saveLock.current) return;
    if (dating.preferredMinAge > dating.preferredMaxAge) {
      showFeedback(
        "dating",
        "error",
        "Tuổi tối thiểu phải nhỏ hơn hoặc bằng tuổi tối đa.",
      );
      return;
    }
    if (dating.enabled && dating.acceptedIntents.length === 0) {
      showFeedback(
        "dating",
        "error",
        "Chọn ít nhất một mong muốn hẹn hò của người bạn muốn gặp.",
      );
      return;
    }
    saveLock.current = true;
    setSaving("dating");
    try {
      const result = await api.updateDatingProfile(token, datingInput(dating));
      if (activeToken.current !== token) return;
      setDating(datingInput(result));
      setSavedDating(datingInput(result));
      showFeedback(
        "dating",
        "success",
        "Đã lưu hồ sơ hẹn hò và các lựa chọn của bạn.",
      );
    } catch (error) {
      if (activeToken.current === token)
        showFeedback("dating", "error", errorMessage(error));
    } finally {
      setSaving(null);
      saveLock.current = false;
    }
  }

  function addGame() {
    if (!catalog || !social || social.games.length >= 20) return;
    for (const game of catalog.games) {
      const platform = catalog.platforms.find(
        (entry) =>
          !social.games.some(
            (existing) =>
              existing.gameCode === game.code &&
              existing.platformCode === entry.code,
          ),
      );
      if (platform) {
        editSocial({
          games: [
            ...social.games,
            {
              gameCode: game.code,
              platformCode: platform.code,
              crossplayEnabled: false,
            },
          ],
        });
        return;
      }
    }
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const direction = ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
      event.key,
    );
    if (!direction || saving) return;
    event.preventDefault();
    const nextTab =
      event.key === "Home"
        ? "social"
        : event.key === "End"
          ? "dating"
          : tab === "social"
            ? "dating"
            : "social";
    setTab(nextTab);
    document.getElementById(`profile-tab-${nextTab}`)?.focus();
  }

  const initials =
    user?.displayName
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("vi-VN") || "B";
  const dateOfBirth = user?.birthDate
    ? new Date(`${user.birthDate}T12:00:00`).toLocaleDateString("vi-VN")
    : "Chưa có thông tin";
  const currentFeedback = feedback[tab];
  const hasMoreGames =
    !!catalog &&
    !!social &&
    social.games.length <
      Math.min(20, catalog.games.length * catalog.platforms.length);

  return (
    <div className="profile-page page-enter">
      <div className="page-eyebrow">
        <span className="eyebrow-line" /> MỖI KẾT NỐI BẮT ĐẦU TỪ BẠN
      </div>
      <div className="page-heading profile-page-heading">
        <div>
          <h1>
            Góc nhỏ <span className="gradient-text">của bạn.</span>
          </h1>
          <p>Chia sẻ điều bạn yêu thích và cách bạn muốn kết nối.</p>
        </div>
        <Link to="/discover" className="profile-back-link">
          Khám phá <ArrowRight size={16} />
        </Link>
      </div>
      <div className="profile-layout">
        <aside className="profile-sidebar">
          <GlassCard className="profile-identity-card">
            <div className="profile-identity-orbit" aria-hidden="true">
              <span>{initials}</span>
              <i />
              <b>
                <Sparkles size={16} />
              </b>
            </div>
            <span className="profile-overline">HỒ SƠ CÁ NHÂN</span>
            <h2>{user?.displayName || "Tài khoản của bạn"}</h2>
            <p className="profile-identity-copy">
              Một phiên bản chân thật của bạn.
              <br />
              Hai cách để tìm sự đồng điệu.
            </p>
            <dl className="profile-account-details">
              <div>
                <dt>Email</dt>
                <dd>{user?.email}</dd>
              </div>
              <div>
                <dt>Ngày sinh</dt>
                <dd>{dateOfBirth}</dd>
              </div>
            </dl>
            <p className="profile-account-note">
              <LockKeyhole size={14} /> Thông tin tài khoản hiện chỉ có thể xem.
            </p>
          </GlassCard>
          <div className="profile-side-note">
            <ShieldCheck size={23} />
            <div>
              <h3>Bạn chọn cách xuất hiện</h3>
              <p>
                Hồ sơ kết bạn và hẹn hò có cài đặt riêng. Bạn có thể tạm tắt
                từng chế độ bất cứ lúc nào.
              </p>
            </div>
          </div>
          {(socialDirty || datingDirty) && (
            <p className="profile-unsaved-note" role="status">
              Bạn có thay đổi chưa lưu. Hãy lưu từng hồ sơ trước khi rời trang.
            </p>
          )}
        </aside>
        <GlassCard className="profile-editor-card">
          <div
            className="profile-tabs"
            role="tablist"
            aria-label="Chọn hồ sơ cần chỉnh sửa"
          >
            <button
              id="profile-tab-social"
              role="tab"
              type="button"
              aria-selected={tab === "social"}
              aria-controls="profile-panel-social"
              tabIndex={tab === "social" ? 0 : -1}
              disabled={saving !== null}
              onClick={() => setTab("social")}
              onKeyDown={handleTabKey}
            >
              <Users size={18} /> Kết bạn
              {socialDirty && (
                <span
                  className="profile-dirty-dot"
                  aria-label="Có thay đổi chưa lưu"
                />
              )}
            </button>
            <button
              id="profile-tab-dating"
              role="tab"
              type="button"
              aria-selected={tab === "dating"}
              aria-controls="profile-panel-dating"
              tabIndex={tab === "dating" ? 0 : -1}
              disabled={saving !== null}
              onClick={() => setTab("dating")}
              onKeyDown={handleTabKey}
            >
              <Heart size={18} /> Hẹn hò
              {datingDirty && (
                <span
                  className="profile-dirty-dot"
                  aria-label="Có thay đổi chưa lưu"
                />
              )}
            </button>
          </div>
          {loading ? (
            <div className="profile-loading" role="status">
              <LoadingIndicator label="Đang tải hồ sơ của bạn…" />
            </div>
          ) : loadError ? (
            <div className="profile-load-error">
              <ErrorState title="Chưa tải được hồ sơ">{loadError}</ErrorState>
              <CosmicButton
                variant="secondary"
                onClick={() => setRetry((value) => value + 1)}
              >
                Thử tải lại
              </CosmicButton>
            </div>
          ) : (
            catalog &&
            social &&
            dating && (
              <>
                <div
                  id={`profile-panel-${tab}`}
                  role="tabpanel"
                  aria-labelledby={`profile-tab-${tab}`}
                  className="profile-panel"
                >
                  <div className="profile-editor-intro">
                    <span
                      className={`profile-section-symbol ${tab === "dating" ? "is-dating" : ""}`}
                    >
                      {tab === "social" ? (
                        <Users size={22} />
                      ) : (
                        <Heart size={22} />
                      )}
                    </span>
                    <div>
                      <h2>
                        {tab === "social"
                          ? "Tìm những người cùng tần số"
                          : "Dành chỗ cho một mối quan hệ"}
                      </h2>
                      <p>
                        {tab === "social"
                          ? "Một người bạn mới, một cuộc trò chuyện, một đồng đội."
                          : "Bắt đầu từ mong muốn và những giá trị bạn trân trọng."}
                      </p>
                    </div>
                  </div>
                  <form onSubmit={tab === "social" ? saveSocial : saveDating}>
                    <fieldset
                      className="profile-form-fields"
                      disabled={saving !== null}
                    >
                      <legend className="profile-sr-only">
                        {tab === "social"
                          ? "Chỉnh sửa hồ sơ kết bạn"
                          : "Chỉnh sửa hồ sơ hẹn hò"}
                      </legend>
                      {tab === "social" ? (
                        <>
                          <div className="profile-visibility-box">
                            <Toggle
                              id="social-enabled"
                              checked={social.enabled}
                              onChange={(enabled) => editSocial({ enabled })}
                              title="Bật hồ sơ kết bạn"
                              description="Cho phép hồ sơ tham gia tìm bạn theo mục đích và sở thích chung."
                            />
                            <Toggle
                              id="social-ready"
                              checked={social.readyToConnect}
                              onChange={(readyToConnect) =>
                                editSocial({ readyToConnect })
                              }
                              title="Sẵn sàng kết nối"
                              description="Cho người khác biết bạn sẵn sàng làm quen. Đây là lựa chọn của bạn, không phải trạng thái trực tuyến."
                            />
                          </div>
                          <BioField
                            id="social-bio"
                            value={social.bio}
                            onChange={(bio) => editSocial({ bio })}
                            placeholder="Ví dụ: Mình thích công nghệ, nhạc indie và những buổi chơi game cùng bạn bè…"
                          />
                          <SelectionGroup
                            title="Bạn muốn kết nối để…"
                            description="Có thể chọn nhiều mục đích."
                            items={catalog.socialGoals}
                            selected={social.goals}
                            max={3}
                            onChange={(goals) =>
                              editSocial({
                                goals: goals as SocialUpdate["goals"],
                              })
                            }
                          />
                          <SelectionGroup
                            title="Sở thích của bạn"
                            description="Những điểm chung giúp cuộc trò chuyện bắt đầu dễ dàng hơn."
                            items={catalog.interests}
                            selected={social.interests}
                            max={30}
                            onChange={(interests) => editSocial({ interests })}
                          />
                          <div className="profile-games-section">
                            <div className="profile-subsection-heading">
                              <div>
                                <h3>
                                  <Gamepad2 size={17} /> Trò chơi & nền tảng
                                </h3>
                                <p className="profile-help">
                                  Chọn trò chơi bạn muốn tìm đồng đội cùng chơi.
                                </p>
                              </div>
                              <span>{social.games.length}/20</span>
                            </div>
                            {social.games.length === 0 && (
                              <div className="profile-games-empty">
                                <Gamepad2 size={24} />
                                <p>
                                  Chưa thêm trò chơi nào.
                                  <small>
                                    Bạn có thể bỏ qua nếu không tìm bạn chơi
                                    game.
                                  </small>
                                </p>
                              </div>
                            )}
                            <div className="profile-games-list">
                              {social.games.map((choice, index) => {
                                const selectedGame = catalog.games.find(
                                  (game) => game.code === choice.gameCode,
                                );
                                const updateGame = (
                                  patch: Partial<typeof choice>,
                                ) =>
                                  editSocial({
                                    games: social.games.map((item, current) =>
                                      current === index
                                        ? { ...item, ...patch }
                                        : item,
                                    ),
                                  });
                                return (
                                  <div className="profile-game-row" key={index}>
                                    <div className="profile-field">
                                      <label htmlFor={`profile-game-${index}`}>
                                        Trò chơi {index + 1}
                                      </label>
                                      <select
                                        id={`profile-game-${index}`}
                                        value={choice.gameCode}
                                        onChange={(event) =>
                                          updateGame({
                                            gameCode: event.target.value,
                                            crossplayEnabled: false,
                                          })
                                        }
                                      >
                                        {catalog.games.map((game) => (
                                          <option
                                            key={game.code}
                                            value={game.code}
                                          >
                                            {displayItem(game)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="profile-field">
                                      <label
                                        htmlFor={`profile-platform-${index}`}
                                      >
                                        Nền tảng
                                      </label>
                                      <select
                                        id={`profile-platform-${index}`}
                                        value={choice.platformCode}
                                        onChange={(event) =>
                                          updateGame({
                                            platformCode: event.target.value,
                                          })
                                        }
                                      >
                                        {catalog.platforms.map((platform) => (
                                          <option
                                            key={platform.code}
                                            value={platform.code}
                                          >
                                            {displayItem(platform)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <button
                                      type="button"
                                      className="profile-remove-game"
                                      onClick={() =>
                                        editSocial({
                                          games: social.games.filter(
                                            (_, current) => current !== index,
                                          ),
                                        })
                                      }
                                      aria-label={`Xóa trò chơi ${index + 1}: ${selectedGame ? displayItem(selectedGame) : choice.gameCode}`}
                                    >
                                      <Trash2 size={17} />
                                    </button>
                                    <label className="profile-crossplay">
                                      <input
                                        type="checkbox"
                                        checked={choice.crossplayEnabled}
                                        disabled={
                                          !selectedGame?.supportsCrossplay
                                        }
                                        onChange={(event) =>
                                          updateGame({
                                            crossplayEnabled:
                                              event.target.checked,
                                          })
                                        }
                                      />
                                      <span>
                                        Chơi cùng người dùng nền tảng khác
                                        {!selectedGame?.supportsCrossplay && (
                                          <small>
                                            Danh mục hiện chưa hỗ trợ cho trò
                                            chơi này.
                                          </small>
                                        )}
                                      </span>
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                            <CosmicButton
                              type="button"
                              variant="secondary"
                              className="profile-add-game"
                              disabled={!hasMoreGames}
                              onClick={addGame}
                            >
                              <Plus size={15} /> Thêm trò chơi
                            </CosmicButton>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="profile-visibility-box">
                            <Toggle
                              id="dating-enabled"
                              checked={dating.enabled}
                              onChange={(enabled) => editDating({ enabled })}
                              title="Bật hồ sơ hẹn hò"
                              description="Tham gia tính năng hẹn hò với những lựa chọn riêng của bạn."
                            />
                            <Toggle
                              id="dating-visible"
                              checked={dating.visibility === "DISCOVERABLE"}
                              onChange={(visible) =>
                                editDating({
                                  visibility: visible
                                    ? "DISCOVERABLE"
                                    : "HIDDEN",
                                })
                              }
                              title="Hiển thị trong khám phá"
                              description="Hồ sơ chỉ xuất hiện khi cả hồ sơ hẹn hò và lựa chọn này đều được bật."
                            />
                          </div>
                          <BioField
                            id="dating-bio"
                            value={dating.bio}
                            onChange={(bio) => editDating({ bio })}
                            placeholder="Ví dụ: Mình trân trọng sự chân thành, thích những chuyến đi nhỏ và muốn tìm người cùng chia sẻ…"
                          />
                          <div className="profile-field">
                            <label htmlFor="dating-intent">
                              Điều bạn đang tìm kiếm
                            </label>
                            <select
                              id="dating-intent"
                              required
                              value={dating.intentCode}
                              onChange={(event) =>
                                editDating({ intentCode: event.target.value })
                              }
                            >
                              {catalog.datingIntents.map((intent) => (
                                <option key={intent.code} value={intent.code}>
                                  {displayItem(intent)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <fieldset className="profile-age-group">
                            <legend>Độ tuổi bạn muốn tìm hiểu</legend>
                            <p className="profile-help">
                              Từ 18 đến 120 tuổi. Hai bạn cần đáp ứng khoảng
                              tuổi của nhau.
                            </p>
                            <div className="profile-age-inputs">
                              <div className="profile-field">
                                <label htmlFor="dating-min-age">
                                  Tuổi tối thiểu
                                </label>
                                <input
                                  id="dating-min-age"
                                  type="number"
                                  min={18}
                                  max={120}
                                  step={1}
                                  required
                                  value={dating.preferredMinAge || ""}
                                  onChange={(event) =>
                                    editDating({
                                      preferredMinAge: Number(
                                        event.target.value,
                                      ),
                                    })
                                  }
                                />
                              </div>
                              <span aria-hidden="true">—</span>
                              <div className="profile-field">
                                <label htmlFor="dating-max-age">
                                  Tuổi tối đa
                                </label>
                                <input
                                  id="dating-max-age"
                                  type="number"
                                  min={18}
                                  max={120}
                                  step={1}
                                  required
                                  value={dating.preferredMaxAge || ""}
                                  onChange={(event) =>
                                    editDating({
                                      preferredMaxAge: Number(
                                        event.target.value,
                                      ),
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </fieldset>
                          <SelectionGroup
                            title="Mong muốn của người bạn muốn gặp"
                            description="Chọn ít nhất một mục khi bật hồ sơ hẹn hò."
                            items={catalog.datingIntents}
                            selected={dating.acceptedIntents}
                            max={10}
                            onChange={(acceptedIntents) =>
                              editDating({ acceptedIntents })
                            }
                          />
                          <SelectionGroup
                            title="Sở thích của bạn"
                            items={catalog.interests}
                            selected={dating.interests}
                            max={30}
                            onChange={(interests) => editDating({ interests })}
                          />
                          <SelectionGroup
                            title="Giá trị bạn trân trọng"
                            description="Điều gì quan trọng với bạn trong một mối quan hệ?"
                            items={catalog.datingValues}
                            selected={dating.values}
                            max={20}
                            onChange={(values) => editDating({ values })}
                          />
                        </>
                      )}
                    </fieldset>
                    {currentFeedback && (
                      <div
                        className={`profile-feedback is-${currentFeedback.kind}`}
                        role={
                          currentFeedback.kind === "error" ? "alert" : "status"
                        }
                      >
                        {currentFeedback.kind === "success" && (
                          <CheckCircle2 size={19} />
                        )}
                        <p>{currentFeedback.text}</p>
                      </div>
                    )}
                    <div className="profile-save-bar">
                      <span>
                        <UserRound size={15} />
                        {(tab === "social" ? socialDirty : datingDirty)
                          ? "Có thay đổi chưa lưu"
                          : "Hồ sơ đã được đồng bộ"}
                      </span>
                      <CosmicButton
                        type="submit"
                        disabled={
                          saving !== null ||
                          !(tab === "social" ? socialDirty : datingDirty)
                        }
                      >
                        {saving === tab ? (
                          <LoadingIndicator label="Đang lưu…" />
                        ) : (
                          <>
                            <Save size={17} /> Lưu hồ sơ{" "}
                            {tab === "social" ? "kết bạn" : "hẹn hò"}
                          </>
                        )}
                      </CosmicButton>
                    </div>
                    {currentFeedback?.kind === "success" && (
                      <Link
                        to={`/discover?mode=${tab}`}
                        className="profile-success-link"
                      >
                        Khám phá người phù hợp <ChevronRight size={17} />
                      </Link>
                    )}
                  </form>
                </div>
              </>
            )
          )}
        </GlassCard>
      </div>
    </div>
  );
}
