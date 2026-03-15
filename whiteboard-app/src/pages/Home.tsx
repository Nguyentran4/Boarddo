import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

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
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBoard = useCallback(() => {
    setIsCreating(true);
    const boardId = generateBoardId();
    // Small delay for the animation
    setTimeout(() => {
      navigate(`/board/${boardId}`);
    }, 400);
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
    <div className="home">
      {/* Animated background */}
      <div className="home__bg">
        <div className="home__bg-orb home__bg-orb--1" />
        <div className="home__bg-orb home__bg-orb--2" />
        <div className="home__bg-orb home__bg-orb--3" />
      </div>

      <div className="home__content">
        {/* Logo */}
        <div className="home__logo">
          <div className="home__logo-icon">🎨</div>
        </div>

        <h1 className="home__title">Whiteboard</h1>
        <p className="home__subtitle">
          Real-time collaborative drawing. Create a board or join an existing one.
        </p>

        {/* Actions */}
        <div className="home__actions">
          <button
            className={`home__btn home__btn--create ${isCreating ? "home__btn--loading" : ""}`}
            onClick={handleCreateBoard}
            id="btn-create-board"
          >
            <span className="home__btn-icon">✨</span>
            <span>Create New Board</span>
          </button>

          <div className="home__divider-row">
            <div className="home__divider-line" />
            <span className="home__divider-text">or join existing</span>
            <div className="home__divider-line" />
          </div>

          <form className="home__join-form" onSubmit={handleJoinBoard} id="join-form">
            <input
              className="home__input"
              type="text"
              placeholder="Enter board code…"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              maxLength={20}
              id="input-board-code"
            />
            <button
              className="home__btn home__btn--join"
              type="submit"
              disabled={!joinCode.trim()}
              id="btn-join-board"
            >
              Join →
            </button>
          </form>
        </div>

        {/* Recent boards hint */}
        <p className="home__hint">
          Tip: Share the board URL with others to collaborate in real-time!
        </p>
      </div>
    </div>
  );
}
