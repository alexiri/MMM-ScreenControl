/*
 *    pulse.c
 *
 *    gcc -o pulse pulse.c -lpigpio -lrt -lpthread
 *
 *    sudo ./pulse
 *
 */

#include <stdio.h>
#include <pigpio.h>

#define PIN_BUZZER 12
#define FREQUENCY 300
#define TIME 0.1

int main(int argc, char *argv[]) {

    if (gpioInitialise() < 0) {
        fprintf(stderr, "pigpio initialisation failed\n");
        return 1;
    }

    /* Set GPIO mode */
    gpioSetMode(PIN_BUZZER, PI_OUTPUT);

    /* Set the frequency */
    gpioSetPWMfrequency(PIN_BUZZER, FREQUENCY);

    /* Start 50% dutycycle PWM */
    gpioPWM(PIN_BUZZER, 128);

    time_sleep(TIME);

    /* Stop */
    gpioPWM(PIN_BUZZER, 0);

    /* Stop DMA, release resources */
    gpioTerminate();

    return 0;
}
