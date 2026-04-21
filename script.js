const tracks = [
  {
    title: "PUBLIC ENEMY",
    videoId: "cDbyLWYMIVE",
    safeStartMin: 18,
    safeStartMax: 108,
  },
  {
    title: "PUBLIC ENEMY remix",
    videoId: "K5SiwHXZO-I",
    safeStartMin: 18,
    safeStartMax: 138,
  },
  {
    title: "PUBLIC ENEMIES",
    videoId: "jb-3JjruxAw",
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
let currentRound = null;
let currentListenStep = 0;
let playbackTimer = null;
let retryTimer = null;
let retryInterval = null;
let pendingListenDuration = 0;
let isWaitingForPlayback = false;
let playerReady = false;
let isLocked = false;
let isAnswerRevealed = false;
let currentScore = 0;
let bestScore = Number(window.localStorage.getItem(bestScoreKey) || 0);

const coverEl = document.getElementById("player-cover");
const listenButton = document.getElementById("listen-button");
const statusEl = document.getElementById("status");
const scoreValueEl = document.getElementById("score-value");
const bestValueEl = document.getElementById("best-value");
const choiceButtons = [...document.querySelectorAll(".choice-button")];

function pickRandomTrack() {
  return tracks[Math.floor(Math.random() * tracks.length)];
}

function randomStart(track) {
  const span = track.safeStartMax - track.safeStartMin;
  return track.safeStartMin + Math.floor(Math.random() * (span + 1));
}

function clearTimers() {
  window.clearTimeout(playbackTimer);
  window.clearTimeout(retryTimer);
  window.clearInterval(retryInterval);
  pendingListenDuration = 0;
  isWaitingForPlayback = false;
}

function stopPlayback() {
  window.clearTimeout(playbackTimer);
  pendingListenDuration = 0;
  isWaitingForPlayback = false;
  if (playerReady) {
    player.pauseVideo();
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
  setCoverVisible(true);
  setChoicesDisabled(false);
  listenButton.disabled = !playerReady;
  setStatus(playerReady ? "듣고 골라보세요." : "플레이어 준비 중...");

  if (playerReady) {
    player.loadVideoById({
      videoId: currentRound.track.videoId,
      startSeconds: currentRound.startTime,
    });
    player.pauseVideo();
  }
}

function getCurrentDuration() {
  return listenDurations[Math.min(currentListenStep, listenDurations.length - 1)];
}

function getRoundScore() {
  return roundScores[Math.min(currentListenStep, roundScores.length - 1)];
}

function playSnippet() {
  if (!playerReady || !currentRound || isLocked || isWaitingForPlayback) {
    return;
  }

  const duration = getCurrentDuration();
  listenButton.disabled = true;
  pendingListenDuration = duration;
  isWaitingForPlayback = true;
  setStatus(`${duration}초 준비 중`);

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
  player = new YT.Player("player", {
    videoId: tracks[0].videoId,
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
      onReady: () => {
        playerReady = true;
        const iframe = player.getIframe();
        iframe.setAttribute("allow", "autoplay; encrypted-media; fullscreen");
        nextRound();
      },
      onStateChange: (event) => {
        if (event.data !== YT.PlayerState.PLAYING || !isWaitingForPlayback) {
          return;
        }

        const duration = pendingListenDuration;
        isWaitingForPlayback = false;
        pendingListenDuration = 0;
        setStatus(`${duration}초 재생`);

        playbackTimer = window.setTimeout(() => {
          player.pauseVideo();
          currentListenStep += 1;
          listenButton.disabled = false;

          if (!isAnswerRevealed) {
            setStatus("정답을 골라보세요.");
          }
        }, duration * 1000);
      },
    },
  });
};
