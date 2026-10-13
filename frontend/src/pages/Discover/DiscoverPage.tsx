import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Compass,
  Gamepad2,
  Heart,
  HeartHandshake,
  MessageCircle,
  Orbit,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { api, ApiError } from "../../api/client";
import type {
  Candidate,
  DatingProfile,
  Goal,
  SocialProfile,
} from "../../api/types";
import { useAuth } from "../../contexts/AuthContext";
import {
  CosmicButton,
  ErrorState,
  GlassCard,
  LoadingIndicator,
  Modal,
} from "../../components/ui/cosmic";
import { errorMessage, labelFor, reasonLabel } from "../../i18n/vi";

const goals: { code: Goal; icon: typeof Users; description: string }[] = [
  { code: "NEW_FRIENDS", icon: Users, description: "Mở rộng vòng bạn bè" },
  { code: "TALK", icon: MessageCircle, description: "Chia sẻ và lắng nghe" },
  { code: "GAMING", icon: Gamepad2, description: "Tìm đồng đội hợp ý" },
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.slice(0, 1))
    .join("")
    .toLocaleUpperCase("vi-VN");
}

export function DiscoverPage() {
  const { token, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const mode = params.get("mode") === "dating" ? "dating" : "social";
  const currentMode = useRef(mode);
  currentMode.current = mode;
  const [goal, setGoal] = useState<Goal>("NEW_FRIENDS");
  const [profiles, setProfiles] = useState<{
    social: SocialProfile;
    dating: DatingProfile;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [retry, setRetry] = useState(0);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [blockTarget, setBlockTarget] = useState<Candidate | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState("");
  const [likes, setLikes] = useState<
    Record<string, "pending" | "liked" | "mutual">
  >({});
  const [invites, setInvites] = useState<Record<string, "pending" | "sent">>({});
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const searchController = useRef<AbortController | null>(null);
  const active = useRef(false);
  const actionLocks = useRef(new Set<string>());
  const blockedIds = useRef(new Set<string>());

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      searchController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    setProfileError("");
    void Promise.all([
      api.getSocialProfile(token, controller.signal),
      api.getDatingProfile(token, controller.signal),
    ])
      .then(([social, dating]) => {
        if (controller.signal.aborted) return;
        setProfiles({ social, dating });
        setGoal(social.goals[0] ?? "NEW_FRIENDS");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setProfileError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, retry]);

  useEffect(() => {
    searchController.current?.abort();
    setCandidates(null);
    setInvites({});
    setSearching(false);
    setSearchError("");
    setDetail(null);
    setNotice("");
    setActionError("");
  }, [mode, goal, token]);

  let setupMessage = "";
  if (profiles) {
    if (mode === "social") {
      if (!profiles.social.enabled)
        setupMessage = "Bật hồ sơ kết bạn để bắt đầu khám phá.";
      else if (!profiles.social.goals.includes(goal))
        setupMessage = `Thêm mục tiêu “${labelFor(goal)}” vào hồ sơ của bạn để tìm những người cùng mong muốn.`;
      else if (goal === "TALK" && !profiles.social.readyToConnect)
        setupMessage =
          "Bật trạng thái sẵn sàng kết nối trong hồ sơ để tìm người tâm sự.";
      else if (goal === "GAMING" && !profiles.social.games.length)
        setupMessage =
          "Thêm trò chơi và nền tảng bạn sử dụng vào hồ sơ để tìm đồng đội.";
    } else if (
      !profiles.dating.enabled ||
      profiles.dating.visibility !== "DISCOVERABLE"
    ) {
      setupMessage =
        "Bật hồ sơ hẹn hò và cho phép hiển thị trong khám phá để gặp người phù hợp.";
    } else if (!profiles.dating.acceptedIntents.length)
      setupMessage =
        "Chọn mong muốn về mối quan hệ bạn chấp nhận trong hồ sơ hẹn hò.";
  }

  async function search() {
    if (!token || loading || !profiles || setupMessage) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setSearchError("");
    setCandidates(null);
    setActionError("");
    setNotice("");
    try {
      const result =
        mode === "social"
          ? await api.discoverSocial(token, goal, 20, controller.signal)
          : await api.discoverDating(token, 20, controller.signal);
      if (!controller.signal.aborted)
        setCandidates(
          result.filter((person) => !blockedIds.current.has(person.id)),
        );
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  async function like(person: Candidate) {
    if (!token || actionLocks.current.has(person.id)) return;
    actionLocks.current.add(person.id);
    setLikes((current) => ({ ...current, [person.id]: "pending" }));
    setActionError("");
    try {
      const result = await api.like(token, person.id);
      if (!result.liked)
        throw new ApiError("Chưa thể gửi lượt thích. Vui lòng thử lại.", 502);
      if (!active.current || blockedIds.current.has(person.id)) return;
      setLikes((current) => ({
        ...current,
        [person.id]: result.mutual ? "mutual" : "liked",
      }));
      if (currentMode.current === "dating")
        setNotice(
          result.mutual
            ? `Bạn và ${person.displayName} đã ghép đôi! Xem kết nối mới trong mục Ghép đôi.`
            : `Đã gửi lượt thích tới ${person.displayName}. Khi cả hai cùng thích nhau, một cặp ghép đôi sẽ được tạo.`,
        );
    } catch (error) {
      if (active.current) {
        setLikes((current) => {
          const next = { ...current };
          delete next[person.id];
          return next;
        });
        setActionError(errorMessage(error));
      }
    } finally {
      actionLocks.current.delete(person.id);
    }
  }

  async function invite(person: Candidate) {
    if (!token || actionLocks.current.has(person.id)) return;
    actionLocks.current.add(person.id);
    setInvites((current) => ({ ...current, [person.id]: "pending" }));
    setActionError("");
    try {
      const result = await api.inviteSocial(token, person.id, goal);
      if (result.status !== "PENDING")
        throw new ApiError("Chưa thể gửi lời mời kết nối. Vui lòng thử lại.", 502);
      if (!active.current || blockedIds.current.has(person.id)) return;
      setInvites((current) => ({ ...current, [person.id]: "sent" }));
      setNotice(`Đã gửi lời mời kết nối tới ${person.displayName}. Lời mời có hiệu lực trong 45 giây.`);
    } catch (error) {
      if (active.current) {
        setInvites((current) => {
          const next = { ...current };
          delete next[person.id];
          return next;
        });
        setActionError(errorMessage(error));
      }
    } finally {
      actionLocks.current.delete(person.id);
    }
  }

  async function block() {
    if (
      !token ||
      !blockTarget ||
      blocking ||
      actionLocks.current.has(blockTarget.id)
    )
      return;
    const person = blockTarget;
    actionLocks.current.add(person.id);
    setBlocking(true);
    setBlockError("");
    try {
      const result = await api.block(token, person.id);
      if (!result.blocked)
        throw new ApiError("Chưa thể chặn người dùng. Vui lòng thử lại.", 502);
      blockedIds.current.add(person.id);
      if (!active.current) return;
      setCandidates(
        (current) =>
          current?.filter((candidate) => candidate.id !== person.id) ?? null,
      );
      setDetail(null);
      setBlockTarget(null);
      setNotice(
        `Đã chặn ${person.displayName}. Người này sẽ không còn xuất hiện trong kết quả khám phá của bạn.`,
      );
    } catch (error) {
      if (active.current) setBlockError(errorMessage(error));
    } finally {
      actionLocks.current.delete(person.id);
      if (active.current) setBlocking(false);
    }
  }

  const selectedInterests = profiles ? profiles[mode].interests : [];
  return (
    <div
      className={`connected-discover page-enter ${mode === "dating" ? "dating-mode" : ""}`}
    >
      <div className="page-eyebrow">
        <span className="eyebrow-line" /> MỖI KẾT NỐI, MỘT KHỞI ĐẦU
      </div>
      <div className="page-heading discover-heading">
        <div>
          <h1>
            Một lời chào,
            <br />
            <span className="gradient-text">một kết nối mới.</span>
          </h1>
          <p>
            Gặp những người cùng sở thích, cùng mong muốn — và là chính mình.
          </p>
        </div>
        <span className="discover-greeting">
          <Sparkles size={17} /> Chào {user?.displayName}
        </span>
      </div>
      <div className="discovery-mode" role="group" aria-label="Chế độ khám phá">
        <button
          aria-pressed={mode === "social"}
          onClick={() => setParams({ mode: "social" })}
        >
          <Users size={19} />
          <span>
            Kết bạn<small>Đồng điệu từ sở thích</small>
          </span>
        </button>
        <button
          aria-pressed={mode === "dating"}
          onClick={() => setParams({ mode: "dating" })}
        >
          <Heart size={19} />
          <span>
            Hẹn hò<small>Mở lòng với một ai đó</small>
          </span>
        </button>
      </div>
      {loading ? (
        <div className="route-state" role="status">
          <LoadingIndicator label="Đang tải hồ sơ khám phá…" />
        </div>
      ) : profileError ? (
        <GlassCard className="route-state">
          <ErrorState title="Chưa thể tải hồ sơ">{profileError}</ErrorState>
          <CosmicButton onClick={() => setRetry((value) => value + 1)}>
            Thử lại
          </CosmicButton>
        </GlassCard>
      ) : (
        <div className="discovery-layout">
          <aside className="discovery-preferences">
            <GlassCard className="preference-card">
              <div className="section-kicker">
                <SlidersHorizontal size={17} /> KẾT NỐI THEO CÁCH CỦA BẠN
              </div>
              <h2>
                {mode === "social"
                  ? "Hôm nay bạn muốn…"
                  : "Điều bạn đang tìm kiếm"}
              </h2>
              {mode === "social" ? (
                <div
                  className="goal-options"
                  role="group"
                  aria-label="Mục tiêu kết bạn"
                >
                  {goals.map(({ code, icon: Icon, description }) => (
                    <button
                      key={code}
                      aria-label={labelFor(code)}
                      aria-pressed={goal === code}
                      onClick={() => setGoal(code)}
                    >
                      <span className="goal-icon">
                        <Icon size={20} />
                      </span>
                      <span>
                        <strong>{labelFor(code)}</strong>
                        <small>{description}</small>
                      </span>
                      <span className="goal-check" aria-hidden="true">
                        {goal === code && <Check size={12} />}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dating-preferences">
                  <HeartHandshake size={29} />
                  <strong>{labelFor(profiles!.dating.intentCode)}</strong>
                  <p>
                    Độ tuổi mong muốn: {profiles!.dating.preferredMinAge}–
                    {profiles!.dating.preferredMaxAge} tuổi
                  </p>
                  <p>
                    Những kết nối phù hợp với mong muốn và giá trị của cả hai.
                  </p>
                </div>
              )}
              <div className="saved-interests">
                <h3>Sở thích trong hồ sơ</h3>
                <div className="tag-list">
                  {selectedInterests.length ? (
                    selectedInterests.map((interest) => (
                      <span className="interest-tag" key={interest}>
                        {labelFor(interest)}
                      </span>
                    ))
                  ) : (
                    <p>Thêm sở thích để khám phá những điểm chung.</p>
                  )}
                </div>
              </div>
              <Link to={`/profile?mode=${mode}`} className="text-link">
                Chỉnh sửa hồ sơ <ArrowRight size={16} />
              </Link>
            </GlassCard>
            <div className="discovery-privacy">
              <ShieldCheck size={21} />
              <div>
                <strong>Thoải mái là chính mình</strong>
                <p>
                  Bạn quyết định khi nào hiển thị hồ sơ và có thể chặn người
                  không phù hợp.
                </p>
              </div>
            </div>
          </aside>
          <section
            className="discovery-results"
            aria-labelledby="discovery-results-title"
          >
            <GlassCard className="discovery-launch">
              <div>
                <span className="section-kicker">
                  {mode === "social" ? "KHÁM PHÁ BẠN MỚI" : "KHÁM PHÁ HẸN HÒ"}
                </span>
                <h2 id="discovery-results-title">
                  {mode === "social"
                    ? "Cùng tần số, dễ kết nối."
                    : "Để sự đồng điệu dẫn lối."}
                </h2>
                <p>
                  {mode === "social"
                    ? "Tìm người phù hợp với mục tiêu và hồ sơ đã lưu của bạn."
                    : "Gửi một lượt thích. Khi cả hai cùng chọn nhau, kết nối bắt đầu."}
                </p>
              </div>
              {!setupMessage && (
                <CosmicButton
                  onClick={() => void search()}
                  disabled={searching}
                >
                  {searching ? (
                    <LoadingIndicator label="Đang tìm kiếm…" />
                  ) : (
                    <>
                      <Search size={17} /> Tìm người phù hợp
                    </>
                  )}
                </CosmicButton>
              )}
            </GlassCard>
            {setupMessage ? (
              <GlassCard className="discovery-empty setup-prompt">
                <span className="discovery-empty-icon">
                  <Users size={34} />
                </span>
                <h3>Thêm một chút về bạn</h3>
                <p>{setupMessage}</p>
                <Link
                  to={`/profile?mode=${mode}`}
                  className="button button-primary"
                >
                  Hoàn thiện hồ sơ <ArrowRight size={17} />
                </Link>
              </GlassCard>
            ) : (
              <>
                {notice && (
                  <div className="discovery-notice" role="status">
                    <Check size={20} />
                    <p>{notice}</p>
                    <button
                      className="icon-button"
                      aria-label="Đóng thông báo"
                      onClick={() => setNotice("")}
                    >
                      ×
                    </button>
                  </div>
                )}
                {actionError && (
                  <ErrorState title="Chưa thể thực hiện">
                    {actionError}
                  </ErrorState>
                )}
                {searchError && (
                  <GlassCard className="discovery-empty">
                    <ErrorState title="Chưa thể tìm người phù hợp">
                      {searchError}
                    </ErrorState>
                    <CosmicButton
                      variant="secondary"
                      onClick={() => void search()}
                    >
                      Thử tìm lại
                    </CosmicButton>
                  </GlassCard>
                )}
                {searching && (
                  <div
                    className="discovery-empty search-progress"
                    role="status"
                  >
                    <div className="connection-orbit" aria-hidden="true">
                      <Orbit size={40} />
                    </div>
                    <LoadingIndicator label="Đang tìm những điểm chung…" />
                    <p>
                      Kết quả được chọn từ các hồ sơ đang cho phép khám phá.
                    </p>
                  </div>
                )}
                {!searching && !searchError && candidates === null && (
                  <div className="discovery-empty first-discovery">
                    <div className="connection-orbit" aria-hidden="true">
                      <Orbit size={42} />
                      <i />
                      <i />
                      <i />
                    </div>
                    <h3>Một người đồng điệu đang ở đâu đó.</h3>
                    <p>
                      Chọn điều bạn muốn và bắt đầu khám phá.
                      <br />
                      Mọi kết nối đều có một lời chào đầu tiên.
                    </p>
                    <span className="subtle-caption">
                      <Sparkles size={14} /> Những điểm chung tạo nên khởi đầu
                    </span>
                  </div>
                )}
                {!searching && candidates?.length === 0 && (
                  <GlassCard className="discovery-empty">
                    <span className="discovery-empty-icon">
                      <Compass size={34} />
                    </span>
                    <h3>Chưa tìm thấy người phù hợp</h3>
                    <p>
                      Hiện chưa có hồ sơ đáp ứng lựa chọn của cả hai. Bạn có thể
                      cập nhật sở thích hoặc quay lại sau.
                    </p>
                    <Link to={`/profile?mode=${mode}`} className="text-link">
                      Xem lại hồ sơ <ArrowRight size={16} />
                    </Link>
                  </GlassCard>
                )}
                {!searching && !!candidates?.length && (
                  <>
                    <div className="results-heading" role="status">
                      <h3>Những người có thể hợp với bạn</h3>
                      <span>{candidates.length} hồ sơ</span>
                    </div>
                    <div className="candidate-grid">
                      {candidates.map((person, index) => (
                        <article className="candidate-card" key={person.id}>
                          <div className={`candidate-cover cover-${index % 3}`}>
                            <span className="candidate-avatar">
                              {initials(person.displayName)}
                            </span>
                            <span className="compatibility">
                              <Sparkles size={13} />{" "}
                              {Math.round(person.score * 100)}/100
                              <small>Điểm đồng điệu</small>
                            </span>
                          </div>
                          <div className="candidate-body">
                            <div className="candidate-name">
                              <h3>{person.displayName}</h3>
                              <span>{person.age} tuổi</span>
                            </div>
                            <p className="candidate-bio">
                              {person.bio ||
                                "Một người bạn mới đang chờ được làm quen."}
                            </p>
                            <div className="tag-list">
                              {person.interests.slice(0, 3).map((interest) => (
                                <span className="interest-tag" key={interest}>
                                  {labelFor(interest)}
                                </span>
                              ))}
                            </div>
                            <p className="candidate-reason">
                              <Sparkles size={13} />
                              {person.reasons[0]
                                ? reasonLabel(person.reasons[0])
                                : "Khám phá những điểm chung"}
                            </p>
                            <div className="candidate-actions">
                              <CosmicButton
                                variant="secondary"
                                onClick={() => setDetail(person)}
                              >
                                Xem hồ sơ
                                <span className="sr-only">
                                  {" "}
                                  {person.displayName}
                                </span>
                              </CosmicButton>
                              {mode === "social" ? (
                                <CosmicButton
                                  variant="secondary"
                                  disabled={
                                    !!invites[person.id] ||
                                    actionLocks.current.has(person.id) ||
                                    (blocking && blockTarget?.id === person.id)
                                  }
                                  aria-label={`${invites[person.id] === "sent" ? "Đã gửi lời mời tới" : "Gửi lời mời tới"} ${person.displayName}`}
                                  onClick={() => void invite(person)}
                                >
                                  {invites[person.id] === "pending" ? (
                                    <LoadingIndicator label="Đang gửi…" />
                                  ) : (
                                    <>
                                      <MessageCircle size={16} />
                                      {invites[person.id] === "sent" ? "Đã gửi lời mời" : "Kết nối"}
                                    </>
                                  )}
                                </CosmicButton>
                              ) : (
                                <CosmicButton
                                  disabled={
                                    !!likes[person.id] ||
                                    (blocking && blockTarget?.id === person.id)
                                  }
                                  aria-label={`${likes[person.id] === "mutual" ? "Đã ghép đôi với" : likes[person.id] === "liked" ? "Đã thích" : "Thích"} ${person.displayName}`}
                                  onClick={() => void like(person)}
                                >
                                  {likes[person.id] === "pending" ? (
                                    <LoadingIndicator label="Đang gửi…" />
                                  ) : (
                                    <>
                                      <Heart size={16} />
                                      {likes[person.id] === "mutual"
                                        ? "Đã ghép đôi"
                                        : likes[person.id] === "liked"
                                          ? "Đã thích"
                                          : "Thích"}
                                    </>
                                  )}
                                </CosmicButton>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <p className="score-explanation">
                      Điểm đồng điệu phản ánh mức phù hợp giữa hai hồ sơ, không
                      dự đoán kết quả của một mối quan hệ.
                    </p>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {detail && (
        <Modal
          title={`Làm quen với ${detail.displayName}`}
          onClose={() => setDetail(null)}
          className="candidate-detail"
        >
          <div className="detail-identity">
            <span className="candidate-avatar">
              {initials(detail.displayName)}
            </span>
            <div>
              <h3>{detail.displayName}</h3>
              <p>
                {detail.age} tuổi · {Math.round(detail.score * 100)}/100 điểm
                đồng điệu
              </p>
            </div>
          </div>
          <p className="detail-bio">
            {detail.bio || "Người này chưa thêm lời giới thiệu."}
          </p>
          <h3>Sở thích</h3>
          <div className="tag-list">
            {detail.interests.length ? (
              detail.interests.map((interest) => (
                <span className="interest-tag" key={interest}>
                  {labelFor(interest)}
                </span>
              ))
            ) : (
              <p>Chưa thêm sở thích.</p>
            )}
          </div>
          {detail.compatibleGames.length > 0 && (
            <>
              <h3>Trò chơi chung</h3>
              <div className="tag-list">
                {detail.compatibleGames.map((game) => (
                  <span className="interest-tag" key={game}>
                    <Gamepad2 size={14} />
                    {labelFor(game)}
                  </span>
                ))}
              </div>
            </>
          )}
          <h3>Điểm kết nối</h3>
          <ul className="detail-reasons">
            {detail.reasons.map((reason) => (
              <li key={reason}>
                <Check size={15} />
                {reasonLabel(reason)}
              </li>
            ))}
          </ul>
          <div className="detail-footer">
            <span>
              <ShieldCheck size={15} /> Kết nối theo lựa chọn của bạn
            </span>
            <button
              className="text-danger"
              disabled={likes[detail.id] === "pending"}
              onClick={() => {
                setBlockTarget(detail);
                setDetail(null);
                setBlockError("");
              }}
            >
              Chặn người này
            </button>
          </div>
        </Modal>
      )}
      {blockTarget && (
        <Modal
          title="Chặn người dùng này?"
          onClose={() => {
            if (!blocking) setBlockTarget(null);
          }}
        >
          <p className="modal-copy">
            Bạn và {blockTarget.displayName} sẽ không còn xuất hiện trong khám
            phá của nhau. Lượt thích và ghép đôi giữa hai người cũng sẽ bị gỡ.
            Hiện chưa có chức năng bỏ chặn.
          </p>
          {blockError && (
            <p className="inline-error" role="alert">
              {blockError}
            </p>
          )}
          <div className="modal-actions">
            <CosmicButton
              variant="secondary"
              disabled={blocking}
              onClick={() => setBlockTarget(null)}
            >
              Hủy
            </CosmicButton>
            <CosmicButton
              variant="danger"
              disabled={blocking}
              onClick={() => void block()}
            >
              {blocking ? "Đang chặn…" : "Xác nhận chặn"}
            </CosmicButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
