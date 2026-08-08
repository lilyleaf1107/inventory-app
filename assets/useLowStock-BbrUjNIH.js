import{b as a}from"./react-query-BEa58Srt.js";import{k as c,s as i}from"./index-BdubusLg.js";const u=30,l=15,s=5;function o(){const t=c();return{warning:t.lowStockWarning||u,danger:t.lowStockDanger||l,critical:t.lowStockCritical||s}}function n(t){const e=o();return t<=0?"out":t<=e.critical?"critical":t<=e.danger?"danger":t<=e.warning?"warning":"normal"}function w(t){switch(t){case"out":return{text:"text-red-800",bg:"bg-red-100/70",border:"border-red-300",label:"缺货"};case"critical":return{text:"text-red-700",bg:"bg-red-50/60",border:"border-red-200",label:"红色预警"};case"danger":return{text:"text-orange-700",bg:"bg-orange-50/40",border:"border-orange-200",label:"橙色预警"};case"warning":return{text:"text-yellow-700",bg:"bg-yellow-50/30",border:"border-yellow-200",label:"黄色预警"};default:return{text:"text-muted-foreground",bg:"bg-background",border:"border",label:""}}}function g(){return a({queryKey:["low-stock"],queryFn:async()=>{const t=o(),{data:e,error:r}=await i.from("inventory").select(`
          id,
          quantity,
          product:products (
            id, name, sku, barcode, image_path, unit, category,
            is_material_area
          ),
          location:locations (
            id, code,
            warehouse:warehouses ( id, code, name )
          )
        `).gt("quantity",0).lte("quantity",t.warning).order("quantity",{ascending:!0});if(r)throw r;return e||[]}})}function f(){const{data:t}=g();return{total:(t==null?void 0:t.length)||0,warning:(t==null?void 0:t.filter(e=>n(e.quantity)==="warning").length)||0,danger:(t==null?void 0:t.filter(e=>n(e.quantity)==="danger").length)||0,critical:(t==null?void 0:t.filter(e=>n(e.quantity)==="critical").length)||0}}function y(){const t=o();return a({queryKey:["low-stock-count",t.warning],queryFn:async()=>{const{count:e,error:r}=await i.from("inventory").select("*",{count:"exact",head:!0}).gt("quantity",0).lte("quantity",t.warning);if(r)throw r;return e||0},staleTime:1e3*60*2})}export{u as L,w as a,g as b,y as c,n as g,f as u};
