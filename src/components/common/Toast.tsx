import React from 'react';
import { useToastStore } from '../../store/toastStore';

interface IToastProps {
  vertical?: 'top' | 'bottom';
  horizontal?: 'start' | 'center' | 'end';
}

const Toast: React.FC<IToastProps> = ({ vertical = 'bottom', horizontal = 'end' }) => {
  const { toasts, removeToast } = useToastStore();

  const positionClasses = {
    vertical: vertical === 'top' ? 'top-4' : 'bottom-4',
    horizontal:
      horizontal === 'start'
        ? 'left-4'
        : horizontal === 'center'
          ? 'left-1/2 -translate-x-1/2'
          : 'right-4',
  };

  const getToastColors = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      case 'warning':
        return 'bg-yellow-500 text-white';
      case 'info':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-800 text-white';
    }
  };

  return (
    <div
      className={`fixed ${positionClasses.vertical} ${positionClasses.horizontal} z-[9999] flex flex-col gap-2`}
    >
      {toasts.map((toast, index) => (
        <div
          key={index}
          onClick={() => removeToast(toast.message)}
          className={`${getToastColors(toast.type)} px-4 py-3 rounded-lg shadow-lg cursor-pointer hover:opacity-90 transition-opacity min-w-[250px] max-w-md`}
        >
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      ))}
    </div>
  );
};

export { Toast };
