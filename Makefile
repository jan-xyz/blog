default: build


build:
	hugo --gc --minify && npx -y pagefind@1.6.0 --site public --root-selector main

serve:
	hugo serve --buildDrafts

clean:
	hugo --gc
