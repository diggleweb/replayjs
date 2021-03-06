export default {
  data() {
    return {
      isLoading: true,
      playbackSpeed: 1,
      queuedEvents: {},
      currentTime: null,
      timeInterval: null,
      timeoutUpdates: [],
      skipInactivity: true,
      activityRanges: [],
      skipThreshold: $config.get("player.skipThreshold", 1000),
      previousActivityRange: null,
    };
  },
  watch: {
    startingTime(startingTime) {
      this.currentTime = parseFloat(startingTime);
    },
  },
  methods: {
    changePlaybackSpeed(speed) {
      this.stop();
      this.playbackSpeed = speed;
      this.play();
    },
    initializePlayer() {
      this.isLoading = true;
      this.stop();

      this.setupIframe(this.rootDom);
      this.updateWindowSize(this.rootWindowSize);

      this.queueEvents();

      setTimeout(() => {
        this.isLoading = false;
      }, 0);
    },
    queueEvents() {
      this.queuedEvents = {};
      this.queueChanges(this.domChanges, "updateDom");
      this.queueChanges(this.scrollEvents, "updateScrollPosition");
      this.queueChanges(this.windowSizeChanges, "updateWindowSize");
      this.queueChanges(this.mouseMovements, "updateMouseMovement");
      this.queueChanges(this.mouseClicks, "addMouseClick", false);
    },
    seek(seekTo) {
      let wasPlaying = this.isPlaying;
      if (this.isPlaying) {
        this.stop();
      }
      this.currentTime = parseFloat(seekTo);
      this.initializePlayer();
      if (wasPlaying) {
        this.play();
      }
    },
    play() {
      this.queuedEvents = Object.assign({}, this.queuedEvents);

      let skipping = false;
      let delay = 13;
      let playbackSpeed = delay * this.playbackSpeed;
      let timeOrigin = performance.now();

      this.timeInterval = this.requestAnimationInterval(() => {
        let clockDelay = performance.now() - timeOrigin - delay;
        timeOrigin = performance.now();

        if (
          !skipping &&
          this.skipInactivity &&
          this.currentActivityRange === -1
        ) {
          skipping = true;
          playbackSpeed =
            delay *
            (Math.floor(
              this.activityRanges[this.previousActivityRange + 1].start,
            ) /
              this.currentTimeInSeconds) *
            5;
        } else if (this.currentActivityRange !== -1) {
          skipping = false;
          playbackSpeed = delay * this.playbackSpeed;
        }

        this.currentTime = this.currentTime + playbackSpeed + clockDelay;

        for (let timing in this.queuedEvents) {
          // https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/setTimeout#Reasons_for_delays_longer_than_specified
          if (timing <= this.currentTime + playbackSpeed + 4) {
            let timeout = (timing - this.currentTime) * (1 / playbackSpeed);
            this.timeoutUpdates.push(
              setTimeout(
                (events) => {
                  events.forEach(({ event, change }) => {
                    this[event](change);
                  });
                },
                timeout >= 0 ? timeout : 0,
                this.queuedEvents[timing],
              ),
            );
            this.$delete(this.queuedEvents, timing);
          } else {
            break;
          }
        }

        if (this.currentTime > this.endingTime) {
          this.stop();
        }
      }, delay);
    },
    stop() {
      this.watchingLive = false;
      this.timeoutUpdates.forEach((timeout, index) => {
        clearTimeout(timeout);
        delete this.timeoutUpdates[index];
      });

      if (this.timeInterval) {
        this.timeInterval.stop();
        this.timeInterval = null;
      }
    },
  },
  computed: {
    rootDom() {
      return this.session && this.session.root;
    },
    rootWindowSize() {
      return this.session && this.session.window_size;
    },
    domChanges() {
      return this.session && this.session.dom_changes;
    },
    mouseClicks() {
      return this.session && this.session.mouse_clicks;
    },
    mouseMovements() {
      return this.session && this.session.mouse_movements;
    },
    scrollEvents() {
      return this.session && this.session.scroll_events;
    },
    windowSizeChanges() {
      return this.session && this.session.window_size_changes;
    },
    consoleMessages() {
      return this.session && this.session.console_messages;
    },
    networkRequests() {
      return this.session && this.session.network_requests;
    },
    startingTime() {
      return this.rootDom && parseFloat(this.rootDom.timing);
    },
    endingTime() {
      if (this.startingTime) {
        let numbers = [
          Object.keys(this.domChanges)[Object.keys(this.domChanges).length - 1],
          Object.keys(this.mouseClicks)[
            Object.keys(this.mouseClicks).length - 1
          ],
          Object.keys(this.networkRequests)[
            Object.keys(this.networkRequests).length - 1
          ],
          Object.keys(this.consoleMessages)[
            Object.keys(this.consoleMessages).length - 1
          ],
          Object.keys(this.windowSizeChanges)[
            Object.keys(this.windowSizeChanges).length - 1
          ],
          Object.keys(this.scrollEvents)[
            Object.keys(this.scrollEvents).length - 1
          ],
          Object.keys(this.mouseMovements)[
            Object.keys(this.mouseMovements).length - 1
          ],
        ].filter((value) => {
          return value !== undefined;
        });

        let endTiming = Math.max(...numbers);
        if (this.watchingLive) {
          this.currentTime = endTiming;
        }
        return endTiming;
      }
    },
    isPlaying() {
      return this.timeInterval !== null;
    },
    currentTimeInSeconds() {
      let seconds = parseInt((this.currentTime - this.startingTime) / 1000);
      return seconds >= 0 ? seconds : 0;
    },
    currentActivityRange() {
      let currentActivityRange = this.activityRanges.findIndex(
        (activityRange) => {
          if (!activityRange.end) {
            return this.currentTimeInSeconds >= Math.floor(activityRange.start);
          }

          return (
            this.currentTimeInSeconds >= Math.floor(activityRange.start) &&
            this.currentTimeInSeconds <= Math.floor(activityRange.end)
          );
        },
      );

      if (currentActivityRange > -1) {
        this.previousActivityRange = currentActivityRange;
      }

      return currentActivityRange;
    },
  },
};
