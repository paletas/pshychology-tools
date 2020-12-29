﻿using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.Localization;
using Microsoft.JSInterop;
using Silvestre.Psychology.Tools.WISC3.WebComponent.ViewModel;
using System;
using System.Collections.Generic;

namespace Silvestre.Psychology.Tools.WISC3.WebComponent.Pages
{
    public partial class WISC3 : ComponentBase
    {
        private enum ConfidenceIntervalEnum
        {
            Percentil90,
            Percentil95
        }

        protected override void OnInitialized()
        {
            this.ViewModel = new WISC3ViewModel(this.LocalizationService, SupportedCountries.Portugal);
            this.ViewModel.OnStandardResultsUpdated += WISC3ViewModel_OnStandardResultsUpdated;

            this.MasterViewModel.ToolName = "WISC-III";
#if DEBUG
            this.SubjectBirthday = new DateTime(2006, 03, 09);
            this.TestDate = new DateTime(2020, 10, 14);

            var rng = new Random();
            foreach (var test in this.ViewModel.StanderdizationPhase.AllTests)
            {
                var boundaries = test.GetRawResultBoundaries();
                test.RawResult = (short)rng.Next(boundaries?.MinValue ?? 1, boundaries?.MaxValue ?? 1);
            }

            WISC3ViewModel_OnStandardResultsUpdated(this, EventArgs.Empty);
#endif
        }

        [Inject]
        protected IJSRuntime JsRuntime { get; set; }

        [Inject]
        protected IStringLocalizer<WISC3> LocalizationService { get; set; }

        [Inject]
        protected PsychologyToolsViewModel MasterViewModel { get; set; }

        private DateTime? _subjectBirthday;
        public DateTime? SubjectBirthday
        {
            get => _subjectBirthday;
            set
            {
                _subjectBirthday = value;
                TestOrSubjectDatesUpdated();
            }
        }

        private DateTime? _testDate;
        public DateTime? TestDate
        {
            get => _testDate;
            set
            {
                _testDate = value;
                TestOrSubjectDatesUpdated();
            }
        }

        public WISC3ViewModel? ViewModel { get; private set; }

        private ConfidenceIntervalEnum VisualizationConfidenceInterval { get; set; } = ConfidenceIntervalEnum.Percentil95;

        public ElementReference StandardResultsChart { get; private set; }

        public ElementReference StandardFactorialIndicesChart { get; private set; }

        public ElementReference QIResultsChart { get; private set; }

        protected void TestOrSubjectDatesUpdated()
        {
            if (this.ViewModel == null) throw new ArgumentNullException(nameof(ViewModel));

            if (SubjectBirthday == null || TestDate == null)
                this.ViewModel.SubjectAge = null;
            else
            {
                this.ViewModel.SubjectAge = DetermineAgeFrom(TestDate, SubjectBirthday);
            }
        }

        private void WISC3ViewModel_OnStandardResultsUpdated(object sender, EventArgs e)
        {
            if (this.ViewModel != null && this.ViewModel.ShouldShowCharts)
            {
                this.JsRuntime.InvokeVoidAsync("wisc3.drawStandardResultsChart", this.StandardResultsChart, this.ViewModel.GetStandardResultsChartData());
                this.JsRuntime.InvokeVoidAsync("wisc3.drawStandardFactorialIndicesChart", this.StandardFactorialIndicesChart, this.ViewModel.GetStandardFactorialIndicesChartData());
                this.JsRuntime.InvokeVoidAsync("wisc3.drawQiResultsChart", this.QIResultsChart, this.ViewModel.GetQiIndicesChartData());
            }
        }

        private IDictionary<string, object>? GetTestResultAttributes(short? rawResult, short? standardizedResult)
        {
            if (rawResult != null && standardizedResult != null) return null;
            else
            {
                IDictionary<string, object> parameters = new Dictionary<string, object>
                {
                    { "class", "bg-gray-400" }
                };

                return parameters;
            }
        }

        private Age? DetermineAgeFrom(DateTime? testDate, DateTime? subjectBirthday)
        {
            if (testDate == null || subjectBirthday == null || testDate <= subjectBirthday) return null;

            var timeSpent = testDate.Value - subjectBirthday.Value;
            var timeSpentAsDateTime = new DateTime(1, 1, 1) + timeSpent;

            var years = timeSpentAsDateTime.Year - 1;
            var months = timeSpentAsDateTime.Month - 1;
            var days = timeSpentAsDateTime.Day - 1;

            return new Age(years, months, days);
        }
    }
}