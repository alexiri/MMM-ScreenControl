Module.register('MMM-ScreenControl', {
  // Default module config.
  defaults: {
    sensorPIN: 27, // GPIO 13
    powerButtonPIN: 17, // GPIO 11
    toggleButtonPIN: 22, // GPIO 15
    buttonCooldownPeriod: 10 * 1000, // 10 seconds
    buzzerPIN: 12, // GPIO 32

    defaultState: true,
    schedules: [],
    toggleButtonWakeTime: 5*60*1000, // 5 minutes

    animationSpeed: 1000,
  },


  socketNotificationReceived: function(notification, payload) {
    this.sendSocketNotification('ACK-socketNotificationReceived', 'got ' + notification + ': ' + payload);
    if (notification === 'SCREEN_STATE') {
      this.state = payload;
      Log.info('Screen is ' + (this.state? 'on':'off'));
      this.sendNotification(notification, payload);

      this.setModuleVisibility(this.state);

      if (!this.started) {
        //this.testCycle();
        this.started = true;
      }
      return;
    }
    
    if (notification === 'BUTTON_PRESSED') {
      Log.info('Button pressed'); 
      this.sendNotification(notification, payload);
      return;
    }
  },

  notificationReceived: function(notification, payload, sender) {
    this.sendSocketNotification('ACK-notificationReceived', 'got ' + notification + ': ' + payload);

    if (notification === 'SET_SCREEN_STATE') {
      this.sendSocketNotification('SET_SCREEN_STATE', payload);
      return;
    }
  },

  start: function() {
    Log.info('Starting module: ' + this.name);

    this.started = false;

    this.sendSocketNotification('CONFIG', this.config);
  },

  testCycle: function() {
    const self = this;
    var orig = this.state;

    this.sendSocketNotification('TEST', 'ready to test from ' + orig);

    setTimeout(function(state) {
      Log.info('Turn screen ' + state);
      self.sendSocketNotification('TEST', 'first one ' + state);
      self.sendSocketNotification('SET_SCREEN_STATE', state);
    }, 30000, !orig);

    setTimeout(function(state) {
      Log.info('Turn screen ' + state);
      self.sendSocketNotification('TEST', 'second one ' + state);
      self.sendSocketNotification('SET_SCREEN_STATE', state);
    }, 90000, orig);

  },

  setModuleVisibility: function(visible) {
    const self = this;
    var options = {lockString: this.identifier};

    var modules = MM.getModules().exceptModule(this);

    for (var i = 0; i < modules.length; i++) {
      if (visible) {
        modules[i].show(this.config.animationSpeed, function() {
          Log.log(self.name + " has shown " + modules[i].identifier );
        }, options);
      } else {
        modules[i].hide(this.config.animationSpeed, function() {
          Log.log(self.name + " has hidden " + modules[i].identifier );
        }, options);
      }
    }
  },

});
