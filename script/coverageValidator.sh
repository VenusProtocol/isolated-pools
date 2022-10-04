#!/bin/bash
reports=('Statements' 'Branches' 'Functions' 'Lines')
i=0
exitCode=0
grep -m 4 '%' coverage/index.html | cut -d '>' -f 2 | cut -d '%' -f 1 | while read -r line; do
    if [ $(echo "$line > 80" | bc) -eq 1 ]; then echo -e "\e[39m${reports[$i]} coverage = \e[92m$line %"; else
        echo -e "\e[39m${reports[$i]} coverage = \e[91m$line % (min 80 %)"
        exitCode=1
    fi
    i=$((i + 1))
    if [ $(echo "$i >= ${#reports[@]}" | bc) -eq 1 ] && [ $exitCode -gt 0 ]; then exit 1; fi
done
