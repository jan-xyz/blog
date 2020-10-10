default: build


build:
	hugo

serve:
	hugo serve

clean:
	hugo --gc
