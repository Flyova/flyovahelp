"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import {
  doc, getDoc, getDocs, onSnapshot, updateDoc, increment, collection,
  query, where, setDoc, addDoc, deleteDoc,
  serverTimestamp, or, orderBy, limit, runTransaction
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { authFetch } from "@/lib/authFetch";
import { User, Zap, Wallet, ShieldCheck, Trophy, Ghost, MessageSquare, Send, X as CloseIcon, Search, Users, Timer as TimerIcon, RefreshCw, Loader2 } from "lucide-react";
import ToastNotification from "@/components/ToastNotification";
import BonusRepay, { owesWelcomeBonus } from "@/components/BonusRepay";
import { generateDistinctNumberPool } from "@/lib/gameNumbers";
import { MAX_STAKE_PER_ROUND, MIN_STAKE_PER_ROUND, clampToStakeRange, hasStakeRange, outsideStakeRange, stakeRangeOf, stakeRangeText } from "@/lib/stakeRange";

export default function GamePage() {
  const { id } = useParams();
  const router = useRouter();
  
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [myWallet, setMyWallet] = useState(0);
  const [gamesRestricted, setGamesRestricted] = useState(false);
  const [owesBonus, setOwesBonus] = useState(false);
  // The stakes a round this player takes challenges at (lib/stakeRange): { min, max }, null = no bound.
  const [myRange, setMyRange] = useState({ min: null, max: null });
  const [rangeDraft, setRangeDraft] = useState(null); // { min, max } strings while editing
  const [rangeError, setRangeError] = useState("");
  const [savingRange, setSavingRange] = useState(false);

  const [activeGame, setActiveGame] = useState(null);
  const [numbers, setNumbers] = useState([]);
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stakeQuery, setStakeQuery] = useState(""); // a stake a round to find players for (whole dollars)
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [outgoingChallenge, setOutgoingChallenge] = useState(null);
  const [outgoingTimer, setOutgoingTimer] = useState(180);
  
  // Game States
  const [gameTimer, setGameTimer] = useState(60);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [hasNewMsg, setHasNewMsg] = useState(false);
  const chatEndRef = useRef(null);
  const showChatRef = useRef(false);
  const lastSeenMessageIdRef = useRef(null);

  const openChat = () => {
    showChatRef.current = true;
    lastSeenMessageIdRef.current = messages[messages.length - 1]?.id ?? lastSeenMessageIdRef.current;
    setShowChat(true);
    setHasNewMsg(false);
  };

  const closeChat = () => {
    showChatRef.current = false;
    setShowChat(false);
  };

  const [showStakeModal, setShowStakeModal] = useState(null);
  const [stakeAmount, setStakeAmount] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isSettling, setIsSettling] = useState(false);
  const isSettlingRef = useRef(false);
  const [isSendingChallenge, setIsSendingChallenge] = useState(false);
  const isSendingChallengeRef = useRef(false);
  const [isAcceptingChallenge, setIsAcceptingChallenge] = useState(false);
  const isAcceptingChallengeRef = useRef(false);
  const persistedCompletedGameRef = useRef(null);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const ROUNDS_PER_PLAYER = 15;
  const MAX_ROUNDS = ROUNDS_PER_PLAYER * 2;
  const MATCH_ADMIN_FEE_RATE = 0.18;
  // Turn countdown is anchored to the server-stored turnStartedAt instead of a
  // local counter, so navigating away and back (or a re-render) recomputes the
  // true remaining time instead of restarting the clock at 60s.
  const TURN_DURATION_MS = 60000;
  // Firestore has no onDisconnect hook, so a client that closes the tab, force-quits,
  // or gets killed in the background never runs the cleanup below. A heartbeat plus a
  // staleness cutoff on read is the standard workaround: anyone whose lastSeen falls
  // behind gets treated as offline even if their Firestore doc still says "online".
  const PRESENCE_HEARTBEAT_MS = 15000;
  const PRESENCE_STALE_MS = 45000;
  const LOBBY_POLL_MS = 5000;
  // Once one friend has won 15 more matches than the other, they can no
  // longer challenge each other until the gap narrows.
  const HEAD_TO_HEAD_WIN_CAP = 15;

  const getHeadToHeadPairId = (a, b) => [a, b].sort().join("_");

  const checkHeadToHeadCap = async (opponentId) => {
    try {
      const pairId = getHeadToHeadPairId(user.uid, opponentId);
      const snap = await getDoc(doc(db, "head_to_head", pairId));
      if (!snap.exists()) return { blocked: false, myWins: 0, oppWins: 0 };
      const wins = snap.data()?.wins || {};
      const myWins = Number(wins[user.uid] || 0);
      const oppWins = Number(wins[opponentId] || 0);
      return { blocked: Math.abs(myWins - oppWins) >= HEAD_TO_HEAD_WIN_CAP, myWins, oppWins };
    } catch (e) {
      // Fail open: a missing/misconfigured security rule for "head_to_head"
      // should never block challenges outright.
      console.error("Head-to-head cap check failed:", e);
      return { blocked: false, myWins: 0, oppWins: 0 };
    }
  };

  const showNotification = useCallback((type, title, message) => {
    setNotification({ type, title, message, id: Date.now() });
  }, []);

  const persistCompletedGameHistory = useCallback(async (game) => {
    if (!game?.id || !game?.player1 || !game?.player2) return false;

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) return false;

      const response = await fetch("/api/game/completed-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ gameId: game.id }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not save completed game history.");
      }

      return true;
    } catch (e) {
      console.error("Failed to persist completed game history", e);
      return false;
    }
  }, []);

  // 1. Auth & Wallet Listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push("/login");
      } else {
        setUser(u);
        const unsubWallet = onSnapshot(doc(db, "users", u.uid), (snap) => {
          if (snap.exists()) {
            setMyWallet(snap.data().wallet || 0);
            setGamesRestricted(!!(snap.data().restrictGames || snap.data().restrictFriends));
            setOwesBonus(owesWelcomeBonus(snap.data()));
            setMyRange(stakeRangeOf(snap.data()));
          }
        });
        setLoadingAuth(false);
        return () => unsubWallet();
      }
    });
    return () => unsubAuth();
  }, [router]);

  // 2. Presence & Challenge Management
  useEffect(() => {
    if (!user) return;
    const myId = user.uid;
    const userRef = doc(db, "users", myId);
    
    setDoc(userRef, {
      status: "online",
      currentPage: "challenge_friends",
      lastSeen: serverTimestamp(),
      isBusy: !!activeGame
    }, { merge: true });

    // Keep lastSeen fresh while this tab is genuinely open on this page.
    const heartbeat = setInterval(() => {
      updateDoc(userRef, { lastSeen: serverTimestamp() }).catch(() => {});
    }, PRESENCE_HEARTBEAT_MS);

    // Drives re-filtering of stale players even though their docs haven't changed.
    const staleTicker = setInterval(() => setPresenceNow(Date.now()), 5000);

    // Who's in the lobby comes from the server (players can't read other accounts).
    const loadPlayers = () =>
      authFetch("/api/game/lobby").then((res) => { if (res.players) setOnlinePlayers(res.players); }).catch(() => {});
    loadPlayers();
    const playersPoll = setInterval(loadPlayers, LOBBY_POLL_MS);

    const threeMinsAgo = Date.now() - (3 * 60 * 1000);
    
    const unsubIncoming = onSnapshot(query(collection(db, "challenges"), where("to", "==", myId), where("status", "==", "pending")), (snap) => {
      const activeChal = snap.docs.find(d => d.data().timestamp > threeMinsAgo);
      setIncomingChallenge(activeChal ? { id: activeChal.id, ...activeChal.data() } : null);
    });

    const unsubOutgoing = onSnapshot(query(collection(db, "challenges"), where("from", "==", myId), where("status", "==", "pending")), (snap) => {
      const activeChal = snap.docs.find(d => d.data().timestamp > threeMinsAgo);
      setOutgoingChallenge(activeChal ? { id: activeChal.id, ...activeChal.data() } : null);
    });

    const gameQuery = query(collection(db, "games"), or(where("player1", "==", myId), where("player2", "==", myId)));
    const unsubGame = onSnapshot(gameQuery, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setActiveGame({ id: snap.docs[0].id, ...data });
        if (data.numberPool && (numbers.length === 0 || data.round !== activeGame?.round || data.turn !== activeGame?.turn)) {
          setNumbers(data.numberPool);
          setSelectedNumber(null);
        }
      } else {
        setActiveGame(null);
      }
    });

    return () => {
        clearInterval(heartbeat);
        clearInterval(staleTicker);
        clearInterval(playersPoll);
        unsubIncoming();
        unsubOutgoing();
        unsubGame();
        updateDoc(userRef, { status: "offline", currentPage: null, isBusy: false }).catch(() => {});
    };
  }, [user, activeGame?.round, activeGame?.turn, !!activeGame]);

  // 3. Outgoing Challenge Ticker
  useEffect(() => {
    if (!outgoingChallenge) return;
    const interval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((180000 - (Date.now() - outgoingChallenge.timestamp)) / 1000));
        setOutgoingTimer(remaining);
        if (remaining <= 0) {
            deleteDoc(doc(db, "challenges", outgoingChallenge.id)).catch(() => {});
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [outgoingChallenge]);

  const handleForfeit = useCallback(async ({ gameId, expectedRound, expectedTurn }) => {
    if (!gameId || !expectedTurn) return;

    const gameRef = doc(db, "games", gameId);
    const timeoutRound = Number(expectedRound || 0);
    const timeoutTurn = String(expectedTurn || "");
    if (!timeoutTurn) return;

    try {
      await runTransaction(db, async (transaction) => {
        const liveSnap = await transaction.get(gameRef);
        if (!liveSnap.exists()) return false;

        const liveGame = liveSnap.data();
        if (liveGame?.status !== "active") return false;

        const liveRound = Number(liveGame?.round || 0);
        const liveTurn = liveGame?.turn;

        // Another client already advanced the round/turn.
        if (liveRound !== timeoutRound || liveTurn !== timeoutTurn) return false;

        const loserId = liveTurn;
        if (!loserId || (loserId !== liveGame.player1 && loserId !== liveGame.player2)) return false;

        const loserIsP1 = loserId === liveGame.player1;
        const winnerScoreKey = loserIsP1 ? "scores.p2" : "scores.p1";
        const loserPoolKey = loserIsP1 ? "wagerPool.p1" : "wagerPool.p2";
        const winnerPoolKey = loserIsP1 ? "wagerPool.p2" : "wagerPool.p1";

        // A forfeited round is still a won round for the opponent, so it has
        // to count toward the same 15-win sweep cap as a correctly-guessed
        // round (see the decisiveWin check in handleGameMove). Without this,
        // a string of timeouts against an AFK opponent could push a player's
        // score past ROUNDS_PER_PLAYER while the match kept running all the
        // way to MAX_ROUNDS.
        const currentWinnerScore = Number(
          (loserIsP1 ? liveGame?.scores?.p2 : liveGame?.scores?.p1) || 0
        );
        const decisiveWin = currentWinnerScore + 1 >= ROUNDS_PER_PLAYER;
        const isGameOver = liveRound >= MAX_ROUNDS || decisiveWin;

        const nextPicker =
          liveGame.picker === liveGame.player1 ? liveGame.player2 : liveGame.player1;

        const winAmount = Number(liveGame?.stakePerRound || 0);
        const pickerRoundsKey =
          liveGame.picker === liveGame.player1 ? "roundsPlayed.p1" : "roundsPlayed.p2";
        const updatePayload = {
          [winnerScoreKey]: increment(1),
          [pickerRoundsKey]: increment(1),
          round: isGameOver ? MAX_ROUNDS : increment(1),
          turn: nextPicker,
          picker: nextPicker,
          gameState: "picking",
          numberPool: generateDistinctNumberPool(),
          status: isGameOver ? "completed" : "active",
          turnStartedAt: serverTimestamp(),
        };

        if (isGameOver) {
          updatePayload.completedAt = serverTimestamp();
        }

        if (winAmount > 0) {
          updatePayload[loserPoolKey] = increment(-winAmount);
          updatePayload[winnerPoolKey] = increment(winAmount);
        }

        transaction.update(gameRef, updatePayload);
        return true;
      });
    } catch (e) {
      console.error("Forfeit error:", e);
    }
  }, [MAX_ROUNDS, ROUNDS_PER_PLAYER]);

  // 4. Game Timer Logic
  // Anchored off the server-recorded turn start time rather than a locally
  // counted-down number, so a remount (tab backgrounded, page revisited)
  // recovers the true remaining time instead of restarting the full 60s
  // window. The tick is scheduled (setTimeout/setInterval) rather than called
  // directly in the effect body, so state updates only ever happen from
  // those deferred callbacks, not synchronously during the effect itself.
  //
  // turnStartedAt is written as a Firestore serverTimestamp() (not a raw
  // Date.now()) precisely so both players race against the same clock.
  // Writing a client-supplied Date.now() would anchor the countdown to
  // whichever device's turn-change action fired the update, so any clock
  // drift between the two players' devices made the timer run out at
  // different moments (and out of step with the server-enforced deadline)
  // on each screen.
  useEffect(() => {
    if (!activeGame || activeGame.status !== "active") return;

    const tick = () => {
      const startedAtValue = activeGame.turnStartedAt;
      const turnStartedAt =
        typeof startedAtValue === "number"
          ? startedAtValue
          : typeof startedAtValue?.toMillis === "function"
          ? startedAtValue.toMillis()
          : Date.now(); // sentinel still pending ack on the writer's own client
      const remainingMs = Math.max(0, TURN_DURATION_MS - (Date.now() - turnStartedAt));
      setGameTimer(Math.ceil(remainingMs / 1000));
      if (remainingMs <= 0) {
        handleForfeit({
          gameId: activeGame?.id,
          expectedRound: activeGame?.round,
          expectedTurn: activeGame?.turn,
        });
      }
    };

    const immediate = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, [activeGame?.turn, activeGame?.round, activeGame?.id, activeGame?.status, activeGame?.turnStartedAt, handleForfeit]);

  useEffect(() => {
    if (!activeGame || activeGame.status !== "completed") return;
    if (persistedCompletedGameRef.current === activeGame.id) return;
    persistCompletedGameHistory(activeGame).then((saved) => {
      if (saved) persistedCompletedGameRef.current = activeGame.id;
    });
  }, [activeGame, persistCompletedGameHistory]);

  const handleManualRefresh = async () => {
    if (!user || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { lastSeen: serverTimestamp() });
      setTimeout(() => setIsRefreshing(false), 1000);
    } catch (e) { setIsRefreshing(false); }
  };

  // 5. Chat Logic
  // Reads showChat via a ref (not a dependency) so this subscription doesn't
  // tear down and re-fire every time the chat panel opens/closes. Previously
  // toggling showChat re-ran this effect and re-evaluated "is the last
  // message unread" against whatever message currently happened to be last,
  // which could re-flag an opponent message the user had already viewed as
  // soon as they closed the chat again.
  useEffect(() => {
    if (!activeGame?.id) return;
    const q = query(collection(db, "games", activeGame.id, "messages"), orderBy("timestamp", "asc"), limit(50));
    const unsubChat = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg) {
        if (showChatRef.current) {
          lastSeenMessageIdRef.current = lastMsg.id;
        } else if (lastMsg.id !== lastSeenMessageIdRef.current && lastMsg.senderId !== user?.uid) {
          setHasNewMsg(true);
        }
      }
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    return () => unsubChat();
  }, [activeGame?.id, user?.uid]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeGame) return;
    await addDoc(collection(db, "games", activeGame.id, "messages"), {
      text: newMessage,
      senderId: user.uid,
      senderName: user.displayName || "Player",
      timestamp: serverTimestamp()
    });
    setNewMessage("");
  };

  // A lobby player's stake range, from /api/game/lobby.
  const rangeOfPlayer = (p) => ({ min: p?.stakeMin ?? null, max: p?.stakeMax ?? null });
  // The stake searched for, if it's one a round can have: the lobby shows only players who take it.
  const searchedStake = Number(stakeQuery) >= MIN_STAKE_PER_ROUND && Number(stakeQuery) <= MAX_STAKE_PER_ROUND ? Number(stakeQuery) : null;

  const openStakeModal = (p) => {
    setStakeAmount((s) => clampToStakeRange(rangeOfPlayer(p), searchedStake ?? s));
    setShowStakeModal(p);
  };

  const saveRange = async (clear = false) => {
    if (savingRange) return;
    setSavingRange(true);
    setRangeError("");
    try {
      const body = clear ? { action: "stakeRange", min: null, max: null } : { action: "stakeRange", ...rangeDraft };
      const res = await authFetch("/api/game/match", { method: "POST", body });
      if (res.error) return setRangeError(res.error);
      setMyRange({ min: res.min ?? null, max: res.max ?? null });
      setRangeDraft(null);
    } catch {
      setRangeError("Could not save your stake range. Please try again.");
    } finally {
      setSavingRange(false);
    }
  };

  const initiateChallenge = async () => {
    if (isSendingChallengeRef.current) return;
    isSendingChallengeRef.current = true;
    setIsSendingChallenge(true);

    try {
      const totalWager = (stakeAmount * ROUNDS_PER_PLAYER);
      const calculatedFee = Math.round(stakeAmount * MATCH_ADMIN_FEE_RATE * 100) / 100;
      const totalCost = totalWager + calculatedFee;

      if (gamesRestricted) {
        return showNotification("warning", "Game Restricted", "Play with Friends has been restricted on your account. Please contact support.");
      }
      const theirRange = rangeOfPlayer(showStakeModal);
      if (outsideStakeRange(theirRange, stakeAmount)) {
        return showNotification("warning", "Outside Their Range", `${showStakeModal.username} only takes challenges at ${stakeRangeText(theirRange)} a round.`);
      }
      if (myWallet < totalCost) {
        return showNotification(
          "warning",
          "Low Balance",
          `Insufficient balance. Required: $${Number(totalCost).toFixed(2)} | Available: $${Number(myWallet || 0).toFixed(2)}`
        );
      }

      const { blocked, myWins, oppWins } = await checkHeadToHeadCap(showStakeModal.id);
      if (blocked) {
        return showNotification(
          "warning",
          "Match Limit Reached",
          `You can't challenge ${showStakeModal.username} right now — the win gap between you two has reached the ${HEAD_TO_HEAD_WIN_CAP}-match cap (${myWins}-${oppWins}).`
        );
      }

      // Guard against double-taps firing two pending challenges to the
      // same target (each one charged a stake on acceptance).
      const existing = await getDocs(query(
        collection(db, "challenges"),
        where("from", "==", user.uid),
        where("to", "==", showStakeModal.id),
        where("status", "==", "pending")
      ));
      if (!existing.empty) {
        setShowStakeModal(null);
        return;
      }

      const made = await addDoc(collection(db, "challenges"), {
        from: user.uid, fromName: user.displayName || "Player", to: showStakeModal.id, toName: showStakeModal.username, status: "pending",
        stakePerRound: stakeAmount, totalWager, fee: calculatedFee, timestamp: Date.now()
      });
      // Their notifications and phone hear about it (best effort).
      authFetch("/api/push/notify", { method: "POST", body: { event: "challenge", challengeId: made.id } }).catch(() => {});
      setShowStakeModal(null);
    } catch (e) {
      console.error("Send challenge error:", e);
      showNotification("error", "Send Failed", "Could not send challenge. Please try again.");
    } finally {
      isSendingChallengeRef.current = false;
      setIsSendingChallenge(false);
    }
  };

  const acceptChallenge = async () => {
    const chal = incomingChallenge;
    if (!chal || isAcceptingChallengeRef.current) return;
    isAcceptingChallengeRef.current = true;
    setIsAcceptingChallenge(true);

    try {
      if (outsideStakeRange(myRange, Number(chal.stakePerRound))) {
        return showNotification("warning", "Outside Your Range", `This challenge is $${chal.stakePerRound} a round, outside your stake range (${stakeRangeText(myRange)}). Decline it, or change your range first.`);
      }
      const totalCost = chal.totalWager + chal.fee;
      if (myWallet < totalCost) {
        return showNotification(
          "warning",
          "Low Balance",
          `Insufficient balance to accept challenge. Required: $${Number(totalCost).toFixed(2)} | Available: $${Number(myWallet || 0).toFixed(2)}`
        );
      }

      const { blocked, myWins, oppWins } = await checkHeadToHeadCap(chal.from);
      if (blocked) {
        showNotification(
          "warning",
          "Match Limit Reached",
          `You can't accept this challenge — the win gap between you two has reached the ${HEAD_TO_HEAD_WIN_CAP}-match cap (${myWins}-${oppWins}).`
        );
        return deleteDoc(doc(db, "challenges", chal.id)).catch(() => {});
      }

      // The server takes both stakes, opens the match (its id is tied to the
      // challenge) and closes the challenge in one transaction, so a duplicate
      // accept (double-tap, retry, second device) can never charge twice.
      const res = await authFetch("/api/game/match", { method: "POST", body: { action: "accept", challengeId: chal.id } });
      if (res.error) {
        showNotification(res.error.startsWith("This challenge was already") ? "info" : "warning", "Not Accepted", res.error);
      }
    } catch (e) {
      console.error("Accept challenge error:", e);
      showNotification("error", "Accept Failed", "Could not accept this challenge. Please try again.");
    } finally {
      isAcceptingChallengeRef.current = false;
      setIsAcceptingChallenge(false);
    }
  };

  const handleGameMove = async (num) => {
    if (!activeGame || activeGame.status !== "active" || activeGame.turn !== user.uid || selectedNumber) return;
    setSelectedNumber(num);
    
    const isP1 = user.uid === activeGame.player1;
    const opponentId = isP1 ? activeGame.player2 : activeGame.player1;

    setTimeout(async () => {
      if (activeGame?.gameState === "picking") {
        await updateDoc(doc(db, "games", activeGame.id), {
          gameState: "guessing",
          turn: opponentId,
          hiddenPick: num,
          turnStartedAt: serverTimestamp()
        });
      } else if (activeGame?.gameState === "guessing") {
        const wasCorrect = num === activeGame.hiddenPick;
        const scoreKey = isP1 ? "scores.p1" : "scores.p2";
        
        const winnerPoolKey = isP1 ? "wagerPool.p1" : "wagerPool.p2";
        const loserPoolKey = activeGame.picker === activeGame.player1 ? "wagerPool.p1" : "wagerPool.p2";

        const winAmount = activeGame.stakePerRound;
        const nextPicker = activeGame.picker === activeGame.player1 ? activeGame.player2 : activeGame.player1;
        const completedRound = Number(activeGame?.round || 0);
        const pickerRoundsKey =
          activeGame.picker === activeGame.player1 ? "roundsPlayed.p1" : "roundsPlayed.p2";

        // The match only ends early if a player sweeps all 15 of their
        // opponent's cards (guesses every one of their picks correctly).
        // Otherwise it always runs the full 30 rounds, even if one player
        // is far ahead on score.
        const newScoreP1 = (activeGame.scores?.p1 || 0) + (wasCorrect && isP1 ? 1 : 0);
        const newScoreP2 = (activeGame.scores?.p2 || 0) + (wasCorrect && !isP1 ? 1 : 0);
        const decisiveWin = newScoreP1 >= ROUNDS_PER_PLAYER || newScoreP2 >= ROUNDS_PER_PLAYER;

        const isGameOver = completedRound >= MAX_ROUNDS || decisiveWin;

        const updatePayload = {
          gameState: "picking", turn: nextPicker, picker: nextPicker, round: isGameOver ? MAX_ROUNDS : increment(1),
          [scoreKey]: wasCorrect ? increment(1) : increment(0),
          [pickerRoundsKey]: increment(1),
          numberPool: generateDistinctNumberPool(),
          status: isGameOver ? "completed" : "active",
          turnStartedAt: serverTimestamp()
        };

        if (isGameOver) {
          updatePayload.completedAt = serverTimestamp();
        }

        if (wasCorrect) {
          updatePayload[loserPoolKey] = increment(-winAmount);
          updatePayload[winnerPoolKey] = increment(winAmount);
        }

        await updateDoc(doc(db, "games", activeGame.id), updatePayload);
      }
    }, 800);
  };

  const finalizeAndRefund = async () => {
    if (!activeGame || isSettlingRef.current) return;
    isSettlingRef.current = true;
    setIsSettling(true);

    try {
      const historySaved = await persistCompletedGameHistory(activeGame);
      if (!historySaved) {
        showNotification("error", "History Not Saved", "Could not save this match history yet. Please try again.");
        return;
      }

      // The server pays out the pools (never more than both stakes) and removes the
      // match; a duplicate click finds it gone and pays nothing.
      const res = await authFetch("/api/game/match", { method: "POST", body: { action: "settle", gameId: activeGame.id } });
      if (res.error) throw new Error(res.error);

      setActiveGame(null);
      router.push('/dashboard');
    } catch (e) {
      console.error("Settlement error:", e);
      showNotification("error", "Settlement Failed", "Could not settle this match. Please try again.");
    } finally {
      isSettlingRef.current = false;
      setIsSettling(false);
    }
  };

  const activePlayers = onlinePlayers.filter((p) => presenceNow - Number(p.lastSeen || 0) <= PRESENCE_STALE_MS);

  const filteredPlayers = activePlayers.filter(p =>
    p.username?.toLowerCase().includes(searchQuery.toLowerCase())
    && (searchedStake === null || !outsideStakeRange(rangeOfPlayer(p), searchedStake))
  );

  if (loadingAuth) return <div className="min-h-screen bg-[#0B1220] flex items-center justify-center text-white italic font-black">SYNCING...</div>;

  if (activeGame?.status === "completed") {
    const isP1 = user.uid === activeGame.player1;
    const myScore = isP1 ? activeGame.scores?.p1 : activeGame.scores?.p2;
    const myRefund = isP1 ? activeGame.wagerPool?.p1 : activeGame.wagerPool?.p2;
    return (
      <div className="min-h-screen bg-[#0B1220] text-white flex flex-col items-center justify-center p-6 text-center">
        <ToastNotification notification={notification} onClose={() => setNotification(null)} />
        <Trophy size={64} className="text-[#8B1E3F] mb-4" />
        <h1 className="text-4xl font-black italic uppercase mb-2">Game Over</h1>
        <div className="bg-[#142036] p-8 rounded-[2.5rem] w-full max-w-sm border border-white/5 mb-6">
            <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold opacity-50 uppercase tracking-widest">Successful Guesses</span>
                <span className="text-2xl font-black italic">{myScore}</span>
            </div>
            <div className="flex justify-between items-center mb-4 border-t border-white/10 pt-4">
                <span className="text-xs font-bold opacity-50 uppercase tracking-widest">Settlement Amount</span>
                <span className="text-2xl font-black italic text-green-400">${myRefund?.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-gray-500 font-black uppercase mt-4">Crediting final balance to wallet...</p>
        </div>
        <button onClick={finalizeAndRefund} disabled={isSettling} className="w-full max-w-sm bg-[#2457D6] py-5 rounded-2xl font-black uppercase italic shadow-lg disabled:opacity-50">{isSettling ? "Settling..." : "Claim & Exit"}</button>
      </div>
    );
  }

  // A match already running is played out; a new one waits for the $3 bonus to be paid back.
  if (!activeGame && owesBonus) {
    return (
      <div className="min-h-screen bg-[#0B1220] text-white p-6 pb-32 flex flex-col items-center justify-center">
        <h1 className="text-xl font-black italic uppercase mb-5">Play with Friends</h1>
        <BonusRepay className="w-full max-w-sm" what="play with friends" balance={myWallet} />
      </div>
    );
  }

  if (!activeGame) {
    return (
      <div className="min-h-screen bg-[#0B1220] text-white p-6 pb-32">
        <ToastNotification notification={notification} onClose={() => setNotification(null)} />
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-xl font-black italic uppercase">Challenge Friends</h1>
            <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-2">
                  <Users size={12} className="text-[#8B1E3F]" />
                  <span className="text-[10px] font-black text-white/40 uppercase">{activePlayers.length} Ready To Play</span>
                </div>
                <button onClick={handleManualRefresh} className={`p-1 rounded-full bg-white/5 hover:bg-white/10 transition-all ${isRefreshing ? 'animate-spin' : ''}`}>
                  <RefreshCw size={12} className="text-[#8B1E3F]" />
                </button>
            </div>
          </div>
        </div>

        <div data-testid="my-stake-range" className="bg-[#142036] border border-white/5 rounded-[2rem] p-5 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">My stake range</p>
              <p className="font-black italic text-sm mt-1">{hasStakeRange(myRange) ? `${stakeRangeText(myRange)} a round` : "Any stake"}</p>
            </div>
            {!rangeDraft && (
              <button onClick={() => { setRangeError(""); setRangeDraft({ min: myRange.min ?? "", max: myRange.max ?? "" }); }}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase shrink-0">{hasStakeRange(myRange) ? "Change" : "Set range"}</button>
            )}
          </div>
          {!rangeDraft && <p className="text-[10px] font-bold text-white/40 mt-2">Challenges below your minimum or above your maximum stake won&apos;t reach you.</p>}
          {rangeDraft && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[["min", "Minimum"], ["max", "Maximum"]].map(([k, label]) => (
                  <label key={k} className="block">
                    <span className="text-[9px] font-black uppercase text-white/40">{label} ($ a round)</span>
                    <input inputMode="numeric" value={rangeDraft[k]} placeholder={k === "min" ? "No minimum" : "No maximum"}
                      onChange={(e) => { setRangeError(""); setRangeDraft((d) => ({ ...d, [k]: e.target.value.replace(/[^\d]/g, "") })); }}
                      aria-label={`${label} stake`}
                      className="mt-1 w-full bg-black/20 border border-white/10 p-3 rounded-xl outline-none font-bold text-sm focus:border-[#2457D6]" />
                  </label>
                ))}
              </div>
              {rangeError && <p role="alert" className="text-[11px] font-bold text-rose-300">{rangeError}</p>}
              <div className="flex gap-2">
                <button onClick={() => saveRange(false)} disabled={savingRange} className="flex-1 bg-[#8B1E3F] py-3 rounded-xl font-black uppercase text-[10px] disabled:opacity-50">{savingRange ? "Saving..." : "Save range"}</button>
                {hasStakeRange(myRange) && <button onClick={() => saveRange(true)} disabled={savingRange} className="px-4 bg-white/5 rounded-xl font-black uppercase text-[10px] disabled:opacity-50">Any stake</button>}
                <button onClick={() => { setRangeDraft(null); setRangeError(""); }} disabled={savingRange} className="px-4 text-gray-400 font-black uppercase text-[10px]">Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className={`flex gap-3 ${searchedStake !== null ? "mb-3" : "mb-8"}`}>
          <div className="relative flex-1 min-w-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                  type="text" 
                  placeholder="Search by name..."
                  className="w-full bg-[#142036] border border-white/5 p-4 pl-12 rounded-2xl outline-none font-bold text-sm focus:border-[#2457D6] transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
              />
          </div>
          <div className="relative w-32 shrink-0">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-black text-sm">$</span>
              <input
                  inputMode="numeric"
                  placeholder="Stake"
                  aria-label="Search players by stake a round"
                  data-testid="stake-search"
                  className="w-full bg-[#142036] border border-white/5 p-4 pl-8 rounded-2xl outline-none font-bold text-sm focus:border-[#2457D6] transition-all"
                  value={stakeQuery}
                  onChange={(e) => setStakeQuery(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
              />
          </div>
        </div>
        {searchedStake !== null && (
          <p data-testid="stake-search-note" className="text-[10px] font-bold text-white/40 mb-8 px-1">
            Players who take ${searchedStake} a round. Challenge one and the stake starts at ${searchedStake}.
          </p>
        )}

        {showStakeModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <div className="bg-[#142036] w-full max-w-xs rounded-[2.5rem] p-8 border border-white/10 shadow-2xl">
              <h2 className="text-center font-black italic uppercase mb-6 text-sm">Set Round Stake</h2>
              {hasStakeRange(rangeOfPlayer(showStakeModal)) && (
                <p data-testid="their-range" className="text-center text-[10px] font-black uppercase text-amber-300 -mt-3 mb-4">
                  {showStakeModal.username} plays {stakeRangeText(rangeOfPlayer(showStakeModal))} a round
                </p>
              )}
              <div className="flex items-center justify-between mb-8 bg-black/20 p-4 rounded-2xl">
                <button aria-label="Lower stake" onClick={() => setStakeAmount(clampToStakeRange(rangeOfPlayer(showStakeModal), stakeAmount - 1))} className="w-10 h-10 bg-[#2457D6] rounded-xl font-bold">-</button>
                <div className="text-center"><span data-testid="stake-amount" className="text-3xl font-black text-[#8B1E3F] italic">${stakeAmount}</span></div>
                <button aria-label="Raise stake" onClick={() => setStakeAmount(clampToStakeRange(rangeOfPlayer(showStakeModal), stakeAmount + 1))} className="w-10 h-10 bg-[#2457D6] rounded-xl font-bold">+</button>
              </div>
              <div className="space-y-2 mb-8 px-2">
                <div className="flex justify-between text-[10px] font-black uppercase"><span className="opacity-40">Entry Wager ({ROUNDS_PER_PLAYER}x)</span><span>${stakeAmount * ROUNDS_PER_PLAYER}</span></div>
                <div className="flex justify-between text-[10px] font-black uppercase text-emerald-400"><span>Match Admin Fee ({Math.round(MATCH_ADMIN_FEE_RATE * 100)}%)</span><span>${(Math.round(stakeAmount * MATCH_ADMIN_FEE_RATE * 100) / 100).toFixed(2)}</span></div>
              </div>
              <button onClick={initiateChallenge} disabled={isSendingChallenge} className="w-full bg-[#8B1E3F] py-4 rounded-2xl font-black uppercase text-xs mb-3 shadow-lg disabled:opacity-50">{isSendingChallenge ? "Sending..." : "Send Challenge"}</button>
              <button onClick={() => setShowStakeModal(null)} className="w-full text-gray-500 font-black uppercase text-[10px]">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Choose Player</h3>
          {filteredPlayers.length === 0 ? (
            <div className="text-center py-20 bg-[#142036]/50 rounded-[2.5rem] border border-dashed border-white/10">
              <Ghost size={40} className="mx-auto mb-4 opacity-20" /><p className="text-[10px] font-black uppercase text-gray-500 italic">{searchedStake !== null ? `Nobody here takes $${searchedStake} a round` : "No users found"}</p>
            </div>
          ) : filteredPlayers.map(p => (
            <div key={p.id} className="bg-[#142036] p-5 rounded-[2rem] flex justify-between items-center border border-white/5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-[#2457D6] rounded-xl flex items-center justify-center font-black italic text-[#8B1E3F] relative">
                    {p.username?.[0] || 'P'}
                    {p.isBusy && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-[#142036]"></div>
                    )}
                </div>
                <div className="flex flex-col">
                    <span className="font-bold italic uppercase text-sm">{p.username}</span>
                    {p.isBusy && <span className="text-[8px] font-black text-orange-500 uppercase tracking-tighter">Busy in-game</span>}
                    {hasStakeRange(rangeOfPlayer(p)) && <span data-testid="player-range" className="text-[9px] font-black text-amber-300 uppercase tracking-tight">Stakes {stakeRangeText(rangeOfPlayer(p))}</span>}
                </div>
              </div>
              <button 
                disabled={p.isBusy}
                onClick={() => openStakeModal(p)} 
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase ${p.isBusy ? 'bg-gray-700 text-gray-500 opacity-50' : 'bg-[#8B1E3F] text-white'}`}
              >
                {p.isBusy ? 'Busy' : 'Challenge'}
              </button>
            </div>
          ))}
        </div>

        {outgoingChallenge && (
            <div className="fixed bottom-24 left-6 right-6 bg-[#2457D6] p-8 rounded-[2.5rem] shadow-2xl z-50 border-4 border-[#8B1E3F] flex flex-col items-center text-center animate-pulse-slow">
                <Loader2 size={32} className="text-white animate-spin mb-4" />
                <p className="text-[10px] font-black uppercase text-white/60 tracking-widest mb-1">Awaiting Response From</p>
                <h3 className="text-2xl font-black italic uppercase text-white mb-4">{outgoingChallenge.toName}</h3>
                <div className="bg-black/20 px-8 py-3 rounded-2xl">
                    <span className="text-4xl font-mono font-black text-white">{outgoingTimer}s</span>
                </div>
                <p className="mt-4 text-[8px] font-black uppercase text-white/40">Do not close this page. Please wait</p>
            </div>
        )}

        {incomingChallenge && (
          <div className="fixed bottom-24 left-6 right-6 bg-[#2457D6] p-6 rounded-[2.5rem] shadow-2xl z-50 border-t-4 border-[#8B1E3F] animate-bounce-short">
            <p className="text-white font-black italic mb-2 uppercase text-center text-sm">{incomingChallenge.fromName} Challenges You!</p>
            <p className="text-center text-[10px] font-black opacity-60 mb-4 uppercase tracking-widest">Wager: ${(incomingChallenge.totalWager + incomingChallenge.fee).toFixed(2)}</p>
            {outsideStakeRange(myRange, Number(incomingChallenge.stakePerRound)) && (
              <p data-testid="incoming-out-of-range" className="text-center text-[10px] font-black text-amber-200 mb-4 uppercase">
                ${incomingChallenge.stakePerRound} a round is outside your stake range ({stakeRangeText(myRange)})
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={acceptChallenge} disabled={isAcceptingChallenge || outsideStakeRange(myRange, Number(incomingChallenge.stakePerRound))} className="bg-white text-[#2457D6] py-3 rounded-2xl font-black uppercase text-xs disabled:opacity-50">{isAcceptingChallenge ? "Accepting..." : "Accept"}</button>
              <button onClick={() => deleteDoc(doc(db, "challenges", incomingChallenge.id))} disabled={isAcceptingChallenge} className="bg-black/20 py-3 rounded-2xl font-black uppercase text-xs disabled:opacity-50">Decline</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isMyTurn = activeGame?.turn === user.uid;
  const isGuessing = activeGame?.gameState === "guessing";

  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex flex-col relative overflow-hidden pb-[80px]">
      <ToastNotification notification={notification} onClose={() => setNotification(null)} />
      <div className="bg-[#2457D6] p-4 flex justify-between items-center shadow-lg relative z-20">
        <div className="flex flex-col">
            <span className="font-black italic text-[10px] uppercase">ROUND {activeGame?.round} / {MAX_ROUNDS}</span>
            <div className={`flex items-center gap-1 mt-0.5 ${gameTimer < 10 ? 'text-red-400 animate-pulse' : 'text-white/60'}`}>
                <TimerIcon size={10} />
                <span className="text-[10px] font-black font-mono">{gameTimer}S LEFT</span>
            </div>
        </div>
        <div className="flex items-center space-x-2">
            <ShieldCheck size={14} className="text-[#8B1E3F]"/>
            <span className="font-black italic text-lg">${activeGame?.stakePerRound?.toFixed(2)}</span>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-[10px] font-black opacity-40 uppercase">Quit</button>
      </div>

      <div className="flex justify-between items-center p-8 bg-[#142036] border-b border-white/5 relative z-10">
        <div className={`text-center transition-all ${isMyTurn ? 'scale-110' : 'opacity-30'}`}>
          <div className="w-16 h-16 rounded-[2rem] bg-[#2457D6] mx-auto flex items-center justify-center shadow-lg border-2 border-white/5"><User size={32}/></div>
          <p className="mt-2 text-2xl font-black text-[#8B1E3F] italic">{user.uid === activeGame?.player1 ? activeGame?.scores?.p1 : activeGame?.scores?.p2}</p>
        </div>
        <Zap className={`${isMyTurn ? 'text-[#8B1E3F] animate-pulse' : 'text-gray-700'}`} size={28} />
        <div className={`text-center transition-all ${!isMyTurn ? 'scale-110' : 'opacity-30'}`}>
          <div className="w-16 h-16 rounded-[2rem] bg-gray-800 mx-auto flex items-center justify-center shadow-lg border-2 border-white/5"><User size={32}/></div>
          <p className="mt-2 text-2xl font-black italic">{user.uid === activeGame?.player1 ? activeGame?.scores?.p2 : activeGame?.scores?.p1}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-3xl font-black italic mb-2 uppercase tracking-tighter">
          {isMyTurn ? (isGuessing ? "YOUR GUESS" : "PICK A NUMBER") : "OPPONENT'S MOVE"}
        </h2>
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-12">
            {isMyTurn ? (isGuessing ? "MATCH THE TARGET" : "PICK A TARGET FOR THEM") : "WAITING..."}
        </p>

        <div className="grid grid-cols-2 gap-8 w-full max-w-xs">
          {numbers.map((num, i) => (
            <button key={i} disabled={!isMyTurn} onClick={() => handleGameMove(num)}
              className={`aspect-square rounded-[3.5rem] text-4xl font-black italic border-4 transition-all active:scale-95 ${
                selectedNumber === num ? 'bg-[#2457D6] border-[#8B1E3F] shadow-[0_0_40px_rgba(97,61,230,0.3)]' : 'bg-[#142036] border-gray-800 disabled:opacity-20'
              }`}
            >{num}</button>
          ))}
        </div>
      </div>

      <button
        onClick={openChat}
        className="fixed bottom-[100px] right-6 w-14 h-14 bg-[#8B1E3F] rounded-2xl flex items-center justify-center shadow-2xl z-40 transition-transform active:scale-90"
      >
        <MessageSquare size={24} className="text-white" />
        {hasNewMsg && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-[#0B1220] rounded-full animate-bounce"></span>}
      </button>

      <div className={`fixed inset-y-0 right-0 w-80 bg-[#142036] shadow-2xl z-[500] transform transition-transform duration-300 ease-in-out border-l border-white/5 flex flex-col ${showChat ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 bg-[#2457D6] flex justify-between items-center shadow-md">
          <span className="font-black italic uppercase text-xs tracking-widest">Match Chat</span>
          <button onClick={closeChat} className="opacity-60 hover:opacity-100 transition-opacity">
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.senderId === user.uid ? 'items-end' : 'items-start'}`}>
              <span className="text-[8px] font-black uppercase opacity-40 mb-1">{m.senderName}</span>
              <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs font-bold ${m.senderId === user.uid ? 'bg-[#2457D6] text-white rounded-tr-none' : 'bg-white/5 text-gray-300 rounded-tl-none'}`}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="p-4 pb-[100px] border-t border-white/5 bg-[#142036]">
          <form onSubmit={sendMessage} className="flex space-x-2">
            <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type here..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"/>
            <button type="submit" className="w-12 h-12 bg-[#8B1E3F] rounded-xl flex items-center justify-center text-white"><Send size={18} /></button>
          </form>
        </div>
      </div>
    </div>
  );
}
