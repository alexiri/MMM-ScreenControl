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
    buzz: true, // Make some noise when the toggle button is pressed

    animationSpeed: 1000,

    schedulerClass: 'scheduled',
  },


  socketNotificationReceived: function(notification, payload) {
    if (notification === 'SCREEN_STATE') {
      this.state = payload;
      Log.info('Screen is ' + (this.state? 'on':'off'));
      this.sendNotification(notification, payload);

      this.setModuleVisibility(this.state);

      if (!this.started) {
        this.started = true;
      }
      return;
    }
    
    if (notification === 'BUTTON_PRESSED') {
      Log.info('Button pressed'); 
      this.sendNotification(notification, payload);
      MM.getModules().exceptModule(this).withClass(this.config.schedulerClass).enumerate(function(module) {
        if (module.hidden) {
          module.show();
        } else {
          module.hide();
        }
      });
      return;
    }
  },

  notificationReceived: function(notification, payload, sender) {
    var self = this;
    if (sender === undefined && notification === 'DOM_OBJECTS_CREATED') {
      MM.getModules().exceptModule(this).withClass(this.config.schedulerClass).enumerate(function(module) {
        Log.log(self.name + " wants to schedule the display of " + module.name );
        if (typeof module.config.module_schedule === "object") {
          self.sendSocketNotification("CREATE_MODULE_SCHEDULE", {name: module.name, id: module.identifier, schedule: module.config.module_schedule});
        } else {
          Log.error( module.name + " is configured to be scheduled, but the module_schedule option is undefined" );
        }
      });
    } else if (notification === 'SET_SCREEN_STATE') {
      this.sendSocketNotification('SET_SCREEN_STATE', payload);
      return;
    }

  },

  start: function() {
    Log.info('Starting module: ' + this.name);

    this.started = false;

    this.sendSocketNotification('CONFIG', this.config);
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
