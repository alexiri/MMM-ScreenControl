import RPi.GPIO as GPIO
import time

pin = 32
freq = 400
dur = 0.1

GPIO.setmode(GPIO.BOARD)
GPIO.setup(pin, GPIO.OUT)

p = GPIO.PWM(pin, freq)
p.start(1)
time.sleep(dur)
p.stop()

GPIO.cleanup()
