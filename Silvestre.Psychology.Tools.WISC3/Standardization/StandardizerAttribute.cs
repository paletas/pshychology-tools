﻿using System;

namespace Silvestre.Psychology.Tools.WISC3.Standardization
{
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
    public class StandardizerAttribute : Attribute
    {
        public StandardizerAttribute(string country)
        {
            this.Country = country;
        }

        public string Country { get; }
    }
}
