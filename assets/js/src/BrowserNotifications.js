Kanboard.BrowserNotifications = function(app) {
    this.app = app;
    this.eventSource = null;
    this.retryDelay = 3000;
    this.lastIdKey = 'kb_browser_notification_last_id';
    this.unseenCount = 0;
    this.originalTitle = document.title;
    this.faviconLink = null;
    this.originalFaviconHref = '';
    this.audio = null;
    this.audioReady = false;
};

Kanboard.BrowserNotifications.prototype.execute = function() {
    var bodyElement = document.body;

    if (! ('Notification' in window)) {
        return;
    }

    this.bindSettingsPrompt();
    this.bindVisibilityReset();
    this.captureFavicon();
    this.prepareAudio();

    // Start SSE stream to receive notifications
    this.startStream();
};

Kanboard.BrowserNotifications.prototype.requestPermission = function() {
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
};

Kanboard.BrowserNotifications.prototype.bindSettingsPrompt = function() {
    var form = document.getElementById('user-notifications-form');
    var self = this;

    if (! form) {
        return;
    }

    form.addEventListener('submit', function(event) {
        if (form.dataset.permissionPrompted === '1') {
            return;
        }

        var checkbox = form.querySelector('input[name="notification_types[browser]"]');

        if (checkbox && checkbox.checked) {
            if (Notification.permission === 'default') {
                event.preventDefault();
                form.dataset.permissionPrompted = '1';

                Notification.requestPermission().then(function() {
                    form.submit();
                }).catch(function() {
                    form.submit();
                });
            }
        }
    });
};

Kanboard.BrowserNotifications.prototype.startStream = function() {
    var bodyElement = document.body;
    var streamUrl = bodyElement.dataset.browserNotificationStreamUrl || this.buildStreamUrl();

    if (! streamUrl || typeof EventSource === 'undefined') {
        return;
    }

    var lastId = this.getLastId();
    var url = streamUrl;

    if (lastId > 0) {
        url += (streamUrl.indexOf('?') === -1 ? '?' : '&') + 'last_id=' + encodeURIComponent(lastId);
    }

    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('notifications', this.handleMessage.bind(this));
    this.eventSource.onerror = this.handleError.bind(this);
};

Kanboard.BrowserNotifications.prototype.buildStreamUrl = function() {
    // The controller uses the logged-in session user, so we don't need to pass user_id
    return '/?controller=BrowserNotificationController&action=stream';
};

Kanboard.BrowserNotifications.prototype.getUserIdFromPage = function() {
    // No longer needed - user ID comes from server session
    return null;
};

Kanboard.BrowserNotifications.prototype.handleMessage = function(event) {
    if (! event || ! event.data) {
        return;
    }

    var payload = JSON.parse(event.data);

    if (! payload.items || payload.items.length === 0) {
        return;
    }

    var lastId = payload.last_id || 0;

    for (var i = 0; i < payload.items.length; i++) {
        this.showNotification(payload.items[i]);
        this.showToast(payload.items[i]);
        this.incrementUnseen();
        this.playSound();
    }

    if (lastId > 0) {
        this.setLastId(lastId);
    }
};

Kanboard.BrowserNotifications.prototype.showNotification = function(item) {
    if (Notification.permission !== 'granted') {
        return;
    }

    var notification = new Notification(item.title, {
        body: item.body
    });

    notification.onclick = function() {
        if (item.url) {
            window.open(item.url, '_blank', 'noopener');
        }
        notification.close();
    };
};

Kanboard.BrowserNotifications.prototype.showToast = function(item) {
    var container = document.getElementById('kb-notification-toast-container');

    if (! container) {
        this.injectToastStyles();
        container = document.createElement('div');
        container.id = 'kb-notification-toast-container';
        document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.className = 'kb-notification-toast';

    var title = document.createElement('div');
    title.className = 'kb-notification-toast-title';
    title.textContent = item.title;

    var body = document.createElement('div');
    body.className = 'kb-notification-toast-body';
    body.textContent = item.body;

    toast.appendChild(title);
    toast.appendChild(body);
    container.appendChild(toast);

    if (item.url) {
        toast.addEventListener('click', function() {
            window.open(item.url, '_blank', 'noopener');
        });
    }

    window.setTimeout(function() {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 6000);
};

Kanboard.BrowserNotifications.prototype.injectToastStyles = function() {
    if (document.getElementById('kb-notification-toast-styles')) {
        return;
    }

    var style = document.createElement('style');
    style.id = 'kb-notification-toast-styles';
    style.type = 'text/css';
    style.appendChild(document.createTextNode(
        '#kb-notification-toast-container{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:320px;}' +
        '.kb-notification-toast{background:#1f2937;color:#fff;border-radius:6px;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,0.2);cursor:pointer;}' +
        '.kb-notification-toast-title{font-weight:600;font-size:13px;margin-bottom:4px;}' +
        '.kb-notification-toast-body{font-size:12px;opacity:0.9;}'
    ));
    document.head.appendChild(style);
};

Kanboard.BrowserNotifications.prototype.incrementUnseen = function() {
    this.unseenCount += 1;
    this.updateTitleBadge();
    this.updateFaviconBadge();
};

Kanboard.BrowserNotifications.prototype.clearUnseen = function() {
    this.unseenCount = 0;
    this.updateTitleBadge();
    this.restoreFavicon();
};

Kanboard.BrowserNotifications.prototype.updateTitleBadge = function() {
    if (this.unseenCount > 0) {
        document.title = '(' + this.unseenCount + ') ' + this.originalTitle;
    } else {
        document.title = this.originalTitle;
    }
};

Kanboard.BrowserNotifications.prototype.bindVisibilityReset = function() {
    var self = this;

    document.addEventListener('visibilitychange', function() {
        if (! document.hidden) {
            self.clearUnseen();
        }
    });

    window.addEventListener('focus', function() {
        self.clearUnseen();
    });
};

Kanboard.BrowserNotifications.prototype.captureFavicon = function() {
    var links = document.querySelectorAll('link[rel="icon"]');

    if (! links.length) {
        return;
    }

    for (var i = 0; i < links.length; i++) {
        if (links[i].getAttribute('type') === 'image/png') {
            this.faviconLink = links[i];
            break;
        }
    }

    if (! this.faviconLink) {
        this.faviconLink = links[0];
    }

    this.originalFaviconHref = this.faviconLink.getAttribute('href');
};

Kanboard.BrowserNotifications.prototype.updateFaviconBadge = function() {
    var self = this;

    if (! this.faviconLink || ! this.originalFaviconHref || this.unseenCount < 1) {
        return;
    }

    var image = new Image();
    image.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;

        var context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, 32, 32);

        context.fillStyle = '#ef4444';
        context.beginPath();
        context.arc(24, 8, 6, 0, Math.PI * 2);
        context.fill();

        self.faviconLink.setAttribute('href', canvas.toDataURL('image/png'));
    };
    image.src = this.originalFaviconHref;
};

Kanboard.BrowserNotifications.prototype.restoreFavicon = function() {
    if (this.faviconLink && this.originalFaviconHref) {
        this.faviconLink.setAttribute('href', this.originalFaviconHref);
    }
};

Kanboard.BrowserNotifications.prototype.prepareAudio = function() {
    var bodyElement = document.body;

    if (! bodyElement || ! bodyElement.dataset.browserNotificationSoundUrl) {
        return;
    }

    this.audio = new Audio(bodyElement.dataset.browserNotificationSoundUrl);
    this.audio.volume = 0.6;

    var self = this;
    var unlock = function() {
        if (! self.audio || self.audioReady) {
            return;
        }

        self.audio.play().then(function() {
            self.audio.pause();
            self.audio.currentTime = 0;
            self.audioReady = true;
        }).catch(function() {
            self.audioReady = true;
        });
    };

    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
};

Kanboard.BrowserNotifications.prototype.playSound = function() {
    if (! this.audio) {
        return;
    }

    try {
        this.audio.currentTime = 0;
        this.audio.play();
    } catch (e) {
    }
};

Kanboard.BrowserNotifications.prototype.handleError = function() {
    var self = this;

    if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
    }

    window.setTimeout(function() {
        self.startStream();
    }, this.retryDelay);
};

Kanboard.BrowserNotifications.prototype.getLastId = function() {
    var value = window.localStorage.getItem(this.lastIdKey);
    var lastId = parseInt(value, 10);

    if (isNaN(lastId)) {
        return 0;
    }

    return lastId;
};

Kanboard.BrowserNotifications.prototype.setLastId = function(lastId) {
    window.localStorage.setItem(this.lastIdKey, String(lastId));
};
