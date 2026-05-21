import * as React from "react";

interface ButtonProps {
    onPress?: () => void;
    label?: string;
    color?: string;
    disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({ onPress, label, color, disabled }) => {
    return (
        <div className={ `relative flex items-center justify-center w-48 h-8 rounded-xl cursor-pointer overflow-hidden ${ color }` } onClick={ onPress }>
            <p className="relative z-10 text-sm text-(--white) select-none">{ label }</p>
        </div>
    )
}

export default Button