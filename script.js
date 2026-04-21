const tracks = [
  {
    title: "PUBLIC ENEMY",
    videoId: "aF8OFSroHgg",
    safeStartMin: 18,
    safeStartMax: 108,
  },
  {
    title: "PUBLIC ENEMY remix",
    videoId: "qTIwmMuezHs",
    safeStartMin: 18,
    safeStartMax: 138,
  },
  {
    title: "PUBLIC ENEMIES",
    videoId: "yHsJpkQtaus",
    safeStartMin: 18,
    safeStartMax: 116,
  },
];

const listenDurations = [1, 2, 4, 6, 8];
const roundScores = [100, 50, 10, 0, -50];
const revealDelayMs = 3200;
const retryDelayMs = 10000;
const bestScoreKey = "public-enemy-best-score";

let player;
let players = [];
let currentRound = null;
let currentListenStep = 0;
let playbackTimer = null;
let playbackMonitor = null;
let retryTimer = null;
let retryInterval = null;
let pendingListenDuration = 0;
let isWaitingForPlayback = false;
let playbackRequestId = 0;
let activePlaybackRequestId = 0;
let activePlaybackTrackTitle = "";
let activePlaybackStartTime = 0;
let playerReady = false;
let isLocked = false;
let isAnswerRevealed = false;
let currentScore = 0;
let bestScore = Number(window.localStorage.getItem(bestScoreKey) || 0);

const coverEl = document.getElementById("player-cover");
const playerStageEl = document.getElementById("player-stage");
const answerThumbnailEl = document.getElementById("answer-thumbnail");
const listenButton = document.getElementById("listen-button");
const statusEl = document.getElementById("status");
const scoreValueEl = document.getElementById("score-value");
const bestValueEl = document.getElementById("best-value");
const choiceButtons = [...document.querySelectorAll(".choice-button")];

function pickRandomTrack() {
  const readyEntries = players.filter((entry) => entry.isReady);
  const pool = readyEntries.length > 0 ? readyEntries.map((entry) => entry.track) : tracks;
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomStart(track) {
  const span = track.safeStartMax - track.safeStartMin;
  return track.safeStartMin + Math.floor(Math.random() * (span + 1));
}

function clearTimers() {
  window.clearTimeout(playbackTimer);
  window.clearInterval(playbackMonitor);
  window.clearTimeout(retryTimer);
  window.clearInterval(retryInterval);
  pendingListenDuration = 0;
  isWaitingForPlayback = false;
  activePlaybackRequestId = 0;
  activePlaybackTrackTitle = "";
  activePlaybackStartTime = 0;
}

function stopPlayback() {
  window.clearTimeout(playbackTimer);
  window.clearInterval(playbackMonitor);
  pendingListenDuration = 0;
  isWaitingForPlayback = false;
  activePlaybackRequestId = 0;
  activePlaybackTrackTitle = "";
  activePlaybackStartTime = 0;
  if (playerReady) {
    players.forEach((entry) => {
      entry.player.pauseVideo();
    });
  }
}

function setStatus(message) {
  statusEl.textContent = message;
}

function renderScores() {
  scoreValueEl.textContent = String(currentScore);
  bestValueEl.textContent = String(bestScore);
}

function updateBestScore() {
  if (currentScore > bestScore) {
    bestScore = currentScore;
    window.localStorage.setItem(bestScoreKey, String(bestScore));
  }
}

function setChoicesDisabled(disabled) {
  choiceButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function resetChoiceStyles() {
  choiceButtons.forEach((button) => {
    button.classList.remove("correct", "wrong");
  });
}

function setCoverVisible(visible) {
  coverEl.classList.toggle("revealed", !visible);
}

function setAnswerThumbnail(track = null) {
  if (!track) {
    answerThumbnailEl.classList.remove("visible");
    answerThumbnailEl.style.backgroundImage = "";
    return;
  }

  answerThumbnailEl.style.backgroundImage =
    `linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08)), url("https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg")`;
  answerThumbnailEl.classList.add("visible");
}

function setActivePlayer(trackTitle) {
  players.forEach((entry) => {
    entry.slot.classList.toggle("active", entry.track.title === trackTitle);
  });
}

function getPlayerEntry(trackTitle) {
  return players.find((entry) => entry.track.title === trackTitle) || null;
}

function hasReadyPlayers() {
  return players.some((entry) => entry.isReady);
}

function showAnswerThumbnail(track) {
  setActivePlayer(track.title);
  setAnswerThumbnail(track);
}

function nextRound() {
  clearTimers();
  currentRound = {
    track: pickRandomTrack(),
    startTime: 0,
  };
  currentRound.startTime = randomStart(currentRound.track);
  currentListenStep = 0;
  isLocked = false;
  isAnswerRevealed = false;

  resetChoiceStyles();
  setAnswerThumbnail(null);
  setCoverVisible(true);
  setChoicesDisabled(false);
  listenButton.disabled = !hasReadyPlayers();
  setStatus(hasReadyPlayers() ? "듣고 골라보세요." : "플레이어 준비 중...");

  if (hasReadyPlayers()) {
    stopPlayback();
    setActivePlayer(currentRound.track.title);
  }
}

function getCurrentDuration() {
  return listenDurations[Math.min(currentListenStep, listenDurations.length - 1)];
}

function getRoundScore() {
  return roundScores[Math.min(currentListenStep, roundScores.length - 1)];
}

function playSnippet() {
  if (!hasReadyPlayers() || !currentRound || isLocked || isWaitingForPlayback) {
    return;
  }

  stopPlayback();

  const duration = getCurrentDuration();
  listenButton.disabled = true;
  pendingListenDuration = duration;
  isWaitingForPlayback = true;
  playbackRequestId += 1;
  activePlaybackRequestId = playbackRequestId;
  activePlaybackTrackTitle = currentRound.track.title;
  activePlaybackStartTime = currentRound.startTime;
  setStatus(`${duration}초 준비 중`);

  player = getPlayerEntry(currentRound.track.title)?.player || null;
  if (!player) {
    isWaitingForPlayback = false;
    pendingListenDuration = 0;
    listenButton.disabled = false;
    setStatus("플레이어 준비 중...");
    return;
  }

  player.seekTo(currentRound.startTime, true);
  player.playVideo();
}

function lockForRetry() {
  isLocked = true;
  stopPlayback();
  listenButton.disabled = true;
  setChoicesDisabled(true);

  let remaining = retryDelayMs / 1000;
  setStatus(`틀림. ${remaining}초 뒤 다시`);

  retryInterval = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      setStatus(`틀림. ${remaining}초 뒤 다시`);
    }
  }, 1000);

  retryTimer = window.setTimeout(() => {
    window.clearInterval(retryInterval);
    currentScore = 0;
    renderScores();
    nextRound();
  }, retryDelayMs);
}

function handleCorrect(choiceButton) {
  isAnswerRevealed = true;
  clearTimers();
  stopPlayback();
  const earnedScore = getRoundScore();
  currentScore += earnedScore;
  updateBestScore();
  renderScores();
  choiceButton.classList.add("correct");
  showAnswerThumbnail(currentRound.track);
  setCoverVisible(false);
  setChoicesDisabled(true);
  listenButton.disabled = true;
  setStatus(`정답 +${earnedScore}`);

  retryTimer = window.setTimeout(() => {
    nextRound();
  }, revealDelayMs);
}

function handleWrong(choiceButton) {
  resetChoiceStyles();
  choiceButton.classList.add("wrong");
  updateBestScore();
  renderScores();
  lockForRetry();
}

function handleChoiceClick(event) {
  if (!currentRound || isLocked || isAnswerRevealed) {
    return;
  }

  const choiceButton = event.currentTarget;
  const answer = choiceButton.dataset.choice;

  if (answer === currentRound.track.title) {
    handleCorrect(choiceButton);
    return;
  }

  handleWrong(choiceButton);
}

listenButton.addEventListener("click", playSnippet);
choiceButtons.forEach((button) => {
  button.addEventListener("click", handleChoiceClick);
});

window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
  renderScores();

  tracks.forEach((track, index) => {
    const slot = document.createElement("div");
    const slotId = `player-${index}`;
    slot.className = "yt-player-slot";
    slot.id = slotId;
    playerStageEl.appendChild(slot);

    const instance = new YT.Player(slotId, {
      videoId: track.videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (event) => {
          const entry = players.find((item) => item.player === event.target);
          if (entry) {
            entry.isReady = true;
          }

          const iframe = event.target.getIframe();
          iframe.setAttribute("allow", "autoplay; encrypted-media; fullscreen");
          iframe.setAttribute("loading", "eager");

          if (!playerReady && hasReadyPlayers()) {
            playerReady = true;
            nextRound();
          }
        },
        onStateChange: (event) => {
          const activeEntry = getPlayerEntry(activePlaybackTrackTitle);
          if (!activeEntry || event.target !== activeEntry.player) {
            return;
          }

          if (event.data !== YT.PlayerState.PLAYING || !isWaitingForPlayback) {
            return;
          }

          const requestIdAtStart = activePlaybackRequestId;
          const duration = pendingListenDuration;
          isWaitingForPlayback = false;
          pendingListenDuration = 0;
          setStatus(`${duration}초 재생`);

          window.clearInterval(playbackMonitor);
          playbackMonitor = window.setInterval(() => {
            if (requestIdAtStart !== activePlaybackRequestId) {
              window.clearInterval(playbackMonitor);
              return;
            }

            const currentTime = activeEntry.player.getCurrentTime();
            if (currentTime >= activePlaybackStartTime + duration - 0.05) {
              window.clearInterval(playbackMonitor);
              activeEntry.player.pauseVideo();
              currentListenStep += 1;
              listenButton.disabled = false;
              activePlaybackRequestId = 0;
              activePlaybackTrackTitle = "";
              activePlaybackStartTime = 0;

              if (!isAnswerRevealed) {
                setStatus("정답을 골라보세요.");
              }
            }
          }, 100);

          playbackTimer = window.setTimeout(() => {
            if (requestIdAtStart !== activePlaybackRequestId) {
              return;
            }

            window.clearInterval(playbackMonitor);
            activeEntry.player.pauseVideo();
            currentListenStep += 1;
            listenButton.disabled = false;
            activePlaybackRequestId = 0;
            activePlaybackTrackTitle = "";
            activePlaybackStartTime = 0;

            if (!isAnswerRevealed) {
              setStatus("정답을 골라보세요.");
            }
          }, (duration + 1.5) * 1000);
        },
      },
    });

    players.push({
      track,
      slot,
      player: instance,
      isReady: false,
    });
  });

  const bootFallbackTimer = window.setTimeout(() => {
    if (!playerReady && hasReadyPlayers()) {
      playerReady = true;
      nextRound();
    }
  }, 2500);

  if (tracks.length === 0) {
    window.clearTimeout(bootFallbackTimer);
  }
};
