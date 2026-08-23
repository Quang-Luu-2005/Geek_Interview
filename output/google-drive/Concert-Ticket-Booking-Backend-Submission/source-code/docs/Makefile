.PHONY: pdf clean

pdf:
	pdflatex -interaction=nonstopmode -halt-on-error main.tex
	bibtex main || true
	pdflatex -interaction=nonstopmode -halt-on-error main.tex
	pdflatex -interaction=nonstopmode -halt-on-error main.tex

clean:
	rm -f *.aux *.bbl *.blg *.lof *.log *.lot *.out *.toc *.lol *.fls *.fdb_latexmk
