import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import robotImage from "../assets/robot.png";

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
      <header className="landing__header">
        <div className="landing__logo">WiteBoard</div>
        <div className="landing__icons">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
      </header>

      <div className="landing__content">
        <div className="landing__left">
          <h1 className="landing__title">
            <span className="landing__title-line">Collaborative</span><br />
            <span className="landing__title-line">Whiteboard</span>
          </h1>

          <p className="landing__desc">
            A modern, real-time collaborative workspace. Create a board instantly, share the link, and start drawing, brainstorming, and designing together.
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
                  placeholder="Enter board code..."
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  autoFocus
                />
                <button type="submit">→</button>
              </form>
            )}
          </div>
        </div>

        <div className="landing__right">
          <nav className="landing__nav">
            <a href="#">Home</a>
            <a href="#">Features</a>
            <a href="#">Templates</a>
            <a href="#">Pricing</a>
            <a href="#">Contact</a>
            <button className="landing__btn landing__btn--dark" onClick={handleCreateBoard}>Get Started</button>
          </nav>

          <div className="landing__visual">
            <img src={robotImage} alt="Robot hand holding a butterfly" className="landing__image" />
          </div>
        </div>
      </div>
    </div>
  );
}
