var NodeHelper = require("node_helper");
var Gpio = require('onoff').Gpio;
var CronJob = require("cron").CronJob;
var exec = require("child_process").exec;


module.exports = NodeHelper.create({
  scheduledJobs: [],

  start: function() {
    console.info('Starting node helper for: ' + this.name);
    this.started = false;
    this.cooldown = false;
    this.screenState = null;
    this.sleepJob = null;
  },

  stop: function() {
    console.info('Stopping module helper: ' + this.name);
    this.sensor.unexport();
    this.powerButton.unexport();
    this.toggleButton.unexport();
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === 'CONFIG' && this.started == false) {
      const self = this;
      this.config = payload;

      //Setup pins
      this.sensor = new Gpio(this.config.sensorPIN, 'in', 'both');
      this.powerButton = new Gpio(this.config.powerButtonPIN, 'high');
      this.toggleButton = new Gpio(this.config.toggleButtonPIN, 'in', 'rising');

      // Watch screen state for changes
      this.sensor.watch(function(err, value) {
        if (self.screenState != value) { // don't notify old states, just changes
          self.notifyScreenState(value);
          self.screenState = value;
        }
      });

      // Watch toggle button for changes
      this.toggleButton.watch(function(err, value) {
        console.log(self.name + ' detected toggle button');

        if (self.config.buzz == true) {
          // Make some noise!
          exec('sudo ' + self.path + '/pulse &', function(error, stdout, stderr) {
            if (error != null) {
              console.log(self.name + ' failed to make a sound');
              console.log(error);
            }
          });
        }

        // When the screen is on, emit button press events
        if (self.screenState == true) {
          self.sendSocketNotification('BUTTON_PRESSED', true);
        }

        // Screen is already on and there's no sleep job, so we must be in a schedule
        if (self.screenState != self.config.defaultState && self.sleepJob == null) { return; }

          // Remove old job, if it's there
          if (self.sleepJob != null) {
            self.sleepJob.stop();
          }

          if (self.screenState == false) {
            console.log(self.name + ': Screen is off, we should turn it on for a bit');
          } else {
            console.log(self.name + ': Screen is on, we should keep it on a while longer');
          }

          var nextOff = new Date((new Date()).getTime() + self.config.toggleButtonWakeTime);
          try {
            self.sleepJob = new CronJob({
              cronTime: nextOff,
              onTick: function() {
                console.log(self.name + ' is turning the screen off as scheduled after button press');
                self.setScreenState(false);
                this.stop();
                self.sleepJob = null;
              },
              start: true
            });
          } catch(ex) {
            console.log(self.name + ' could not create sleep job, ignoring button');
            return;
          }

          console.log(self.name + ' will turn off the screen at ' + nextOff);
          self.setScreenState(true);
      }); // End this.toggleButton.watch


      this.removeScheduledJobs();
      var newState = this.createScheduledJobs(this.config.schedules);

      var state = (this.sensor.readSync() == 0 ? false : true);
      if (newState == undefined) {
        console.log(this.name + ': no schedules are currently in effect, setting the default state');
        newState = this.config.defaultState;
      }
      if (state != newState) {
        // Set new state
        this.setScreenState(newState);
        // No need to notify, the watcher will do it
      } else {
        // Notify the current state
        this.notifyScreenState(this.sensor.readSync());
      }

        this.started = true;
      } else if (notification === 'GET_SCREEN_STATE') {
        // Notify the current state
        this.notifyScreenState(this.sensor.readSync());
      } else if (notification === 'SET_SCREEN_STATE') {
        // Set a new state
        this.setScreenState(payload);
      } else if (notification === 'CREATE_MODULE_SCHEDULE') {
        this.createModuleSchedule(payload);
      }

    },

    createModuleSchedule: function(payload) {

    },

    createScheduledJobs: function() {
      var newState;

      for (var i = 0; i < this.config.schedules.length; i++) {
        var schedule = this.config.schedules[i];

        // Check if the schedule is valid
        if (!this.isValidSchedule(schedule)) { break; }

        // Create cronJobs
        console.log(this.name + " is scheduling a job: " + JSON.stringify(schedule));
        var startJob = this.createCronJob(schedule.from, schedule.state);
        if (!startJob) { break; }

        var endJob = this.createCronJob(schedule.to, this.config.defaultState);
        if (!endJob) {
          startJob.stop();
          break;
        }

        // Store scheduledJobs
        this.scheduledJobs.push(startJob);
        this.scheduledJobs.push(endJob);

        // Check next dates
        var nextStartDate = startJob.nextDate().toDate();
        var nextEndDate = endJob.nextDate().toDate();
        var now = new Date();

        if (now >= nextStartDate && now < nextEndDate) {
          console.log(this.name + ' job should have been triggered already, will do it now.');
          newState = schedule.state;
        }

        console.log(this.name + ' has created the schedule successfully');
        console.log(this.name + ' will next turn the screen ' + (schedule.state == true ? 'on': 'off') + ' at ' + nextStartDate);
        console.log(this.name + ' will next turn the screen ' + (this.config.defaultState == true ? 'on': 'off') + ' at ' + nextEndDate);
      }

      return newState;
    },

    createCronJob: function(cronTime, action) {
      const self = this;

      if (typeof(action) != typeof(true)) { return false; }

      try {
        var job = new CronJob({
          cronTime: cronTime,
          onTick: function() {
            console.log(self.name + ' is turning the screen ' + (action == true ? 'on': 'off') + ' as scheduled');
            self.setScreenState(action);
            console.log(self.name + ' will execute again at ' + this.nextDate().toDate() + ' based on "' + cronTime + '"');

            // Remove ad-hoc job, if it's there
            if (self.sleepJob != null) {
              console.log(self.name + ' canceling toggle button job');
              self.sleepJob.stop();
              self.sleepJob == null;
            }
          },
          onComplete: function() {
            console.log(self.name + ' has finished turning the screen ' + (action == true ? 'on': 'off') + ' based on "' + cronTime + '"');
          },
          start: true
        });

        return job;

      } catch(ex) {
        console.log(this.name + ' could not create schedule - check action: ' + action + ', expression: "' + cronTime + '"');
      }

    },

    isValidSchedule: function(schedule) {
      var requiredProperties = ['from', 'to', 'state'];

      for(var i = 0; i < requiredProperties.length; i++) {
        var prop = requiredProperties[i];
        if (!Object.prototype.hasOwnProperty.call(schedule, prop)) {
          console.log(this.name + ' cannot create schedule. Missing `' + prop + '`: ' + JSON.stringify(schedule) );
          return false;
        }
      }

      if (typeof(schedule.state) != typeof(true)) {
        console.log(this.name + ' cannot create schedule. State must be true or false');
        return false;
      }

      return true;
    },

    removeScheduledJobs: function() {
      console.log(this.name + " is removing all scheduled jobs");
      for (var i = 0; i < this.scheduledJobs.length; i++) {
        var scheduledJob = this.scheduledJobs[i];
        this.stopCronJob(scheduledJob);
      }
      this.scheduledJobs.length = 0;
    },

    stopCronJob: function(cronJob){
      try {
        cronJob.stop();
      } catch(ex) {
        console.log(this.name + " could not stop cronJob");
      }
    },

    setScreenState: function(newState) {
      if (typeof(newState) != typeof(true)) { return; }

    var state = (this.sensor.readSync() == 0 ? false : true);
    console.log(this.name + ': Screen is currently ' + (state == true ? 'on': 'off'));

    if (state != newState) {
      this.pushPowerButton();
    }
  },

  pushPowerButton: function() {
    const self = this;
    if (this.cooldown) {
      console.log(this.name + ': pushPowerButton: Power button cooling off, ignoring');
      return false;
    }
    console.log(this.name + ': pushPowerButton: Pushing power button');
    this.cooldown = true;

    var currentState = (this.sensor.readSync() == 0 ? false : true);
    var desiredState = ! currentState;
    console.log(this.name + ': pushPowerButton: Current screen state is ' + (currentState == true ? 'on': 'off'));

    // Loop every 5 seconds up to 10 times until the screen state changes
    var count = 0;
    var max = 10;
    var interval = setInterval(function() {
      var currentState = (self.sensor.readSync() == 0 ? false : true);
      if (currentState != desiredState) {
        console.log(self.name + ': pushPowerButton: Pressing power button, attempt ' + count);
        self.powerButton.writeSync(0);
        setTimeout(function() {
          self.powerButton.writeSync(1);
        }, 200);
        count++;
      }

      if (count >= max || currentState == desiredState) {
        clearInterval(interval);
        if (count >= max) {
          console.log(self.name + ': pushPowerButton: Power button failed to change screen state');
        }
      }
    }, 5000);

    setTimeout(function() {
      console.log(self.name + ': pushPowerButton: Power button is enabled again');
      self.cooldown = false;
    }, this.config.buttonCooldownPeriod);
  },

  notifyScreenState: function(value) {
    if (value != 0 && value != 1) { return; }

    this.screenState = value;
    this.sendSocketNotification('SCREEN_STATE', (value == 1 ? true: false) );
    console.log(this.name + ': Screen is ' + (value == 1 ? 'on': 'off') );
  },

});
