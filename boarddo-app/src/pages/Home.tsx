import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import logoImage from "../assets/logo.png";

// Generate a short random board ID
function generateBoardId(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export default function Home() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);

  const handleCreateBoard = useCallback(() => {
    const boardId = generateBoardId();
    navigate(`/board/${boardId}`);
  }, [navigate]);

  const handleJoinBoard = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const id = joinCode.trim().toLowerCase();
      if (id) {
        navigate(`/board/${id}`);
      }
    },
    [joinCode, navigate]
  );

  return (
    <div className="landing">
      {/* Animated Mesh Gradient Background */}
      <div className="landing__bg">
        <div className="landing__bg-orb landing__bg-orb--1"></div>
        <div className="landing__bg-orb landing__bg-orb--2"></div>
        <div className="landing__bg-orb landing__bg-orb--3"></div>
      </div>

      <header className="landing__header">
        <div className="landing__logo">
          <img src={logoImage} alt="Boarddo Logo" className="landing__logo-img" />
          Boarddo
        </div>
        <div className="landing__nav">
          <a href="#">Home</a>
          <a href="#">Features</a>
          <a href="#">Templates</a>
          <a href="#">Pricing</a>
        </div>
        <div className="landing__header-actions">
          <a href="#" className="landing__link">Sign In</a>
          <button className="landing__btn landing__btn--header" onClick={handleCreateBoard}>Get Started</button>
        </div>
      </header>

      <div className="landing__content">
        <div className="landing__left">
          <h1 className="landing__title">
            <span className="landing__title-word">Collaborative</span><br />
            Boarddo
          </h1>

          <p className="landing__desc">
            A modern, real-time collaborative workspace. Create a board instantly, share the link, and start drawing, brainstorming, and designing together without limits.
          </p>

          <div className="landing__actions">
            <button className="landing__btn landing__btn--primary" onClick={handleCreateBoard}>
              Create new board
            </button>
            {!showJoin ? (
              <button className="landing__btn landing__btn--text" onClick={() => setShowJoin(true)}>
                Join existing board
              </button>
            ) : (
              <form className="landing__join" onSubmit={handleJoinBoard}>
                <input
                  type="text"
                  placeholder="Enter board pattern..."
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="landing__btn--join-submit">→</button>
              </form>
            )}
          </div>
        </div>

        <div className="landing__right">
          <div className="landing__visual">
            <div className="landing__mockup">
              {/* Fake UI: Top Bar */}
              <div className="mockup__topbar">
                <div className="mockup__topbar-logo">🎨</div>
                <div className="mockup__topbar-title">Boarddo</div>
                <div className="mockup__topbar-users">
                  <div className="mockup__avatar mockup__avatar--pink">A</div>
                  <div className="mockup__avatar mockup__avatar--blue">S</div>
                  <div className="mockup__avatar mockup__avatar--green">T</div>
                </div>
              </div>

              {/* Fake UI: Sidebar Toolbar */}
              <div className="mockup__sidebar">
                <div className="mockup__tool">
                  <div className="mockup__tool-icon"></div>
                </div>
                <div className="mockup__tool">
                  <div className="mockup__tool-icon"></div>
                </div>
                <div className="mockup__tool mockup__tool--active">
                  <div className="mockup__tool-icon"></div>
                </div>
                <div className="mockup__tool">
                  <div className="mockup__tool-icon"></div>
                </div>
              </div>

              {/* Fake UI: The Canvas */}
              <div className="mockup__canvas">
                {/* 1. Shape Drawing (Sam draws a Giant Circle) */}
                <div className="mockup__drawing-circle"></div>

                {/* 2. Freehand Line Drawing (Alex draws Face into the Circle) */}
                <svg className="mockup__drawing-svg" viewBox="0 0 800 500">
                  {/* Left Eye: > shape */}
                  <path
                    className="mockup__drawing-path mockup__face-eye-l"
                    d="M 160 180 L 200 200 L 160 220"
                    fill="none"
                    stroke="#111"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Right Eye: | shape */}
                  <path
                    className="mockup__drawing-path mockup__face-eye-r"
                    d="M 340 180 L 340 220"
                    fill="none"
                    stroke="#111"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                  {/* Smile: U shape */}
                  <path
                    className="mockup__drawing-path mockup__face-mouth"
                    d="M 160 260 Q 260 340 360 260"
                    fill="none"
                    stroke="#111"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                </svg>

                {/* 3. Taylor creates a Sticky Note */}
                <div className="mockup__sticky">
                  <div className="mockup__sticky-grip"></div>
                  <div className="mockup__sticky-text">Be Happy!</div>
                </div>

                {/* Floating Cursors */}
                <div className="mockup__cursor mockup__cursor--sam">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M5.5 3.2L18.5 12L11 13.5L8.5 21L5.5 3.2Z" fill="#3B82F6" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                  <div className="cursor__label cursor__label--blue">Sam</div>
                </div>

                <div className="mockup__cursor mockup__cursor--alex">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M5.5 3.2L18.5 12L11 13.5L8.5 21L5.5 3.2Z" fill="#F43F5E" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                  <div className="cursor__label cursor__label--pink">Alex</div>
                </div>

                <div className="mockup__cursor mockup__cursor--taylor">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M5.5 3.2L18.5 12L11 13.5L8.5 21L5.5 3.2Z" fill="#10B981" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                  <div className="cursor__label cursor__label--green">Taylor</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
