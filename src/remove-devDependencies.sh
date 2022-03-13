#!/bin/bash 

dev_dependencies_module_list=() 
function get_module_list_from_package(){ 
    input="./package.json" 
    local count=0 
    while IFS= read -r line 
    do 
        if [[ ("$line" == *"devDependencies"*) && ("$line" != *"{}"*) ]]; then 
            count=1 
        else 
            lint_content_trim="$line" 

            if [[ ( $lint_content_trim == *"}"* ) && ( $count > 0 ) ]]; then 
                count=0 
            fi 
            
            if [[ $count > 0 ]]; then 
                module_name=`echo $lint_content_trim | grep -P '^"(?:@?\w+-?\/?\w+)+"' -o` 
                if [ -n "$module_name" ]; then 
                    module_name=$(echo $module_name| cut -d'"' -f 2) 
                    dev_dependencies_module_list+=($module_name) 
                fi 
            fi 
        fi 
    done < "$input" 
} 

function npm_remove_dev_dependencies(){
    for module_name in "${dev_dependencies_module_list[@]}" 
    do 
        npm uninstall $module_name 
    done
}

get_module_list_from_package 
npm_remove_dev_dependencies

