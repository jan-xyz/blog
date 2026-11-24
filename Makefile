default: build


build:
	hugo --gc --minify && npx -y pagefind@1 --site public --root-selector main

serve:
	hugo serve

clean:
	hugo --gc
