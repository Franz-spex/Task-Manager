import type { ReactNode, ButtonHTMLAttributes } from 'react';
export const STORAGE='taskline.personal.v1';
export function Button({children,onClick,primary=false,...props}:{children:ReactNode;onClick?:()=>void;primary?:boolean}&ButtonHTMLAttributes<HTMLButtonElement>){return <button className={primary?'btn primary':'btn'} onClick={onClick} {...props}>{children}</button>}
