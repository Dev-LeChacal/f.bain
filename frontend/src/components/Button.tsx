import * as React from "react";

interface ButtonProps {
    onPress?: () => void;
    dangerous?: boolean;
    disabled?: boolean;
    label?: string;
}

const Button: React.FC<ButtonProps> = ({ onPress, dangerous, disabled, label }) => {
    return (
        <button
            onClick={ onPress }
            disabled={ disabled }
            className="relative flex items-center justify-center w-70 h-9 rounded-xl cursor-pointer select-none text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"

            style={ {
                background: dangerous ? "var(--error)" : "var(--accent)",
                color: "var(--white)",
                border: "none",
            } }

            onMouseEnter={ e => !disabled && ((e.target as HTMLElement).style.filter = "brightness(1.15)") }
            onMouseLeave={ e => ((e.target as HTMLElement).style.filter = "") }
            onMouseDown={ e => !disabled && ((e.target as HTMLElement).style.transform = "scale(0.97)") }
            onMouseUp={ e => ((e.target as HTMLElement).style.transform = "") }
        >
            <p className="font-semibold text-sm">{ label }</p>
        </button>
    );
};

export default Button;