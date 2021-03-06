﻿using System;

namespace Silvestre.Psychology.Tools.WISC3.WebComponent.ViewModel
{
    public class PsychologyToolsViewModel
    {
        private string? _toolName;
        public string? ToolName
        {
            get => _toolName;
            set
            {
                _toolName = value;
                StateChanged?.Invoke(this, EventArgs.Empty);
            }
        }

        public event EventHandler? StateChanged;
    }
}
