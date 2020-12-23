using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.Localization;
using Microsoft.JSInterop;
using Silvestre.Pshychology.Tools.WISC3.WebComponent.ViewModel;
using System;
using System.Collections.Generic;

namespace Silvestre.Pshychology.Tools.WISC3.WebComponent.Pages
{
    public partial class WISC3 : ComponentBase
    {
        protected override void OnInitialized()
        {
            var standerdizer = WISC3Test.Standerdization(SupportedCountries.Portugal);
            var calculator = WISC3Test.QICalculator(SupportedCountries.Portugal);

            this.WISC3ViewModel = new WISC3ViewModel(this.LocalizationService, standerdizer, calculator);
            this.WISC3ViewModel.OnStandardResultsUpdated += WISC3ViewModel_OnStandardResultsUpdated;

            this.ToolName = "WISC-III";
//#if DEBUG
//            this.SubjectBirthday = new DateTime(2006, 03, 09);
//            this.TestDate = new DateTime(2020, 10, 14);
//            TestOrSubjectDatesUpdated(new KeyboardEventArgs());

//            var rng = new Random();
//            foreach (var test in this.WISC3ViewModel.StanderdizationPhase.AllTests)
//            {
//                var boundaries = test.GetRawResultBoundaries();
//                test.RawResult = (short)rng.Next(boundaries?.MinValue ?? 1, boundaries?.MaxValue ?? 1);
//            }

//            WISC3ViewModel_OnStandardResultsUpdated(this, EventArgs.Empty);
//#endif
        }

        [Inject]
        protected IJSRuntime JsRuntime { get; set; }

        [Inject]
        protected IStringLocalizer<WISC3> LocalizationService { get; set; }

        [CascadingParameter(Name = "ToolName")]
        public string ToolName { get; set; }

        public bool IsInitialInputValid { get; set; }

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

        public WISC3ViewModel? WISC3ViewModel { get; private set; }

        public ElementReference StandardResultsChart { get; private set; }

        public ElementReference StandardFactorialIndicesChart { get; private set; }

        public ElementReference QIResultsChart { get; private set; }

        protected void TestOrSubjectDatesUpdated()
        {
            if (this.WISC3ViewModel == null) throw new ArgumentNullException(nameof(WISC3ViewModel));

            if (SubjectBirthday == null || TestDate == null)
                this.WISC3ViewModel.SubjectAge = null;
            else
            {
                var subjectAge = new Age(TestDate.Value.Year - SubjectBirthday.Value.Year, TestDate.Value.Month - SubjectBirthday.Value.Month, TestDate.Value.Day - SubjectBirthday.Value.Day);
                this.WISC3ViewModel.SubjectAge = subjectAge;

                this.IsInitialInputValid = true;
            }
        }

        private void WISC3ViewModel_OnStandardResultsUpdated(object sender, EventArgs e)
        {
            if (this.WISC3ViewModel != null && this.WISC3ViewModel.ShouldShowCharts)
            {
                this.JsRuntime.InvokeVoidAsync("wisc3.drawStandardResultsChart", this.StandardResultsChart, this.WISC3ViewModel.GetStandardResultsChartData());
                this.JsRuntime.InvokeVoidAsync("wisc3.drawStandardFactorialIndicesChart", this.StandardFactorialIndicesChart, this.WISC3ViewModel.GetStandardFactorialIndicesChartData());
                this.JsRuntime.InvokeVoidAsync("wisc3.drawQiResultsChart", this.QIResultsChart, this.WISC3ViewModel.GetQiIndicesChartData());
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

        private int GetYearsBetween(DateTime dateTime1, DateTime dateTime2)
        {
            var zeroTime = new DateTime(1, 1, 1);

            TimeSpan span;
            if (dateTime2 > dateTime1)
                span = dateTime2 - dateTime1;
            else
                span = dateTime1 - dateTime2;

            return (zeroTime + span).Year - 1;
        }

        private int GetMonthsBetween(DateTime dateTime1, DateTime dateTime2)
        {
            var zeroTime = new DateTime(1, 1, 1);

            TimeSpan span;
            if (dateTime2 > dateTime1)
                span = dateTime2 - dateTime1;
            else
                span = dateTime1 - dateTime2;

            return (zeroTime + span).Month - 1;
        }

        private int GetDaysBetween(DateTime dateTime1, DateTime dateTime2)
        {
            if (dateTime2.Day > dateTime1.Day)
                return dateTime2.Day - dateTime1.Day;
            else
                return dateTime1.Day - dateTime2.Day;
        }
    }
}
